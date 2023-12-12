import {Buffer} from "buffer";
import path from "node:path";
import {eq, sql} from "drizzle-orm";
import ora from "ora";
import sharp from "sharp";

import {downloads} from "./schema.js";
import {Download, NewDownload, NewRecord} from "./schema.js";
import {Action, Options, Playscrape} from "./types.js";
import {wait} from "./utils.js";
import {hash} from "./utils.js";

const getNormalSize = ({
    width,
    height,
    orientation,
}: {
    width: number;
    height: number;
    orientation: number;
}) =>
    (orientation || 0) >= 5 ? {width: height, height: width} : {width, height};

export const downloadImage = async ({
    recordId,
    url,
    cookies,
    options,
}: {
    recordId: string;
    url: string;
    cookies: string | null;
    options: Options;
}): Promise<NewDownload> => {
    const {format, dryRun, output} = options;
    const hashedUrl = hash(url);
    const fileName = `${hashedUrl}.${format}`;
    const outputFilePath = path.join(output, fileName);

    const response = await fetch(url, {
        headers: {
            Cookie: cookies || "",
        },
    });

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Process the image and convert it to the expected format
    const image = sharp(buffer);

    if (!dryRun) {
        await image.toFile(outputFilePath);
    }

    const {
        format: origFormat,
        size,
        width,
        height,
        orientation,
    } = await image.metadata();

    // TODO: Also upload this to a third-party service

    return {
        id: hashedUrl,
        recordId: recordId,
        orig_url: url,
        orig_cookies: cookies,
        ...getNormalSize({
            width: width || 0,
            height: height || 0,
            orientation: orientation || 0,
        }),
        file_size: size,
        file_name: fileName,
        orig_format: origFormat?.toString(),
    };
};

export const downloadImages = async ({
    action,
    record,
    url,
    dom,
    query,
    queryAll,
    content,
    cookies,
    playscrape,
    options,
}: {
    action: Action;
    record: NewRecord;
    dom: Document;
    query: (query: string) => Element | null;
    queryAll: (query: string) => Array<Element>;
    url: string;
    content: string;
    cookies: string | null;
    playscrape: Playscrape;
    options: Options;
}) => {
    const {db} = playscrape;
    const {delay, indent, dryRun} = options;

    if (!action.downloadImages) {
        return;
    }

    try {
        const urls = await action.downloadImages({
            record,
            url,
            dom,
            query,
            queryAll,
            content,
        });

        if (urls.length === 0) {
            console.warn("No images to download.");
            return;
        }

        for (const url of urls) {
            const downloadImageSpinner = ora({
                text: `Downloading ${url}`,
                indent,
            }).start();
            try {
                const hashedUrl = hash(url);
                const existingDownload: Download = await db
                    .select()
                    .from(downloads)
                    .where(eq(downloads.id, hashedUrl))
                    .get();

                if (existingDownload) {
                    downloadImageSpinner.succeed(
                        `Image already downloaded: ${url}`,
                    );
                } else {
                    await wait(delay);

                    const imageDetails = await downloadImage({
                        recordId: record.id,
                        url,
                        cookies,
                        options,
                    });

                    if (dryRun) {
                        downloadImageSpinner.succeed(
                            `DRY RUN: Image downloaded: ${url}`,
                        );
                        continue;
                    }

                    await db
                        .insert(downloads)
                        .values(imageDetails)
                        .onConflictDoUpdate({
                            target: downloads.id,
                            set: {
                                ...imageDetails,
                                updated_at: sql`CURRENT_TIMESTAMP`,
                            },
                        })
                        .run();

                    downloadImageSpinner.succeed(`Image downloaded: ${url}`);
                }
            } catch (e) {
                downloadImageSpinner.fail(`Failed to download: ${url}`);
                console.error(e);
                return;
            }
        }
    } catch (e) {
        console.error(e);
        return;
    }
};
