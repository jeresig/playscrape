import {Buffer} from "buffer";
import fs from "node:fs";
import path from "node:path";
import nodeUrl from "node:url";
import {GetObjectCommand, PutObjectCommand} from "@aws-sdk/client-s3";
import {eq, sql} from "drizzle-orm";
import mime from "mime/lite";
import ora from "ora";
import sharp from "sharp";

import {IncomingMessage} from "http";
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

export const getImageIdAndFileName = ({
    url,
    format,
}: {
    url: string;
    format: string;
}) => {
    const isFileURL = url.startsWith("file://");
    let id = "";
    let origFileName = "";

    if (isFileURL) {
        const filePath = nodeUrl.fileURLToPath(url);
        origFileName = path.basename(filePath);
        id = hash(origFileName);
    } else {
        id = hash(url);
        origFileName = path.basename(new URL(url).pathname);
    }

    // If no extension, we default to outputting as a JPG
    if (!origFileName.includes(".")) {
        origFileName = `${origFileName}.jpg`;
    }

    const fileName = format === "original" ? origFileName : `${id}.${format}`;

    return {id, fileName, isFileURL};
};

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
    const {
        format,
        dryRun,
        output,
        overwrite,
        downloadTo,
        aws,
        s3Bucket,
        s3Path,
        s3ACL,
    } = options;
    const {id, fileName, isFileURL} = getImageIdAndFileName({url, format});
    const outputFilePath = path.join(output, fileName);
    let image = null;
    let hasBeenDownloaded = false;

    // Check to see if the image has already been downloaded

    if (!overwrite) {
        if (downloadTo === "local" && fs.existsSync(outputFilePath)) {
            try {
                image = sharp(outputFilePath);
                hasBeenDownloaded = true;
            } catch (e) {
                console.error(`Failed to read image: ${outputFilePath}`, e);
            }
        } else if (downloadTo === "s3") {
            if (!aws) {
                throw new Error("AWS client not initialized.");
            }

            if (!s3Bucket) {
                throw new Error("S3 bucket not specified.");
            }

            // Download from S3
            const command = new GetObjectCommand({
                Bucket: s3Bucket,
                Key: s3Path
                    ? path.join(s3Path, outputFilePath)
                    : outputFilePath,
            });

            try {
                const {Body} = await aws.send(command);

                if (Body) {
                    const stream = Body as IncomingMessage;
                    const buffers = [];

                    for await (const chunk of stream) {
                        buffers.push(chunk);
                    }

                    image = sharp(Buffer.concat(buffers));
                    hasBeenDownloaded = true;
                }
            } catch (e) {
                console.error(
                    `Failed to read image from S3: ${outputFilePath}`,
                    e,
                );
            }
        }
    }

    if (!image) {
        if (isFileURL) {
            const filePath = nodeUrl.fileURLToPath(url);

            if (!fs.existsSync(filePath)) {
                throw new Error(`File does not exist: ${filePath}`);
            }

            if (overwrite) {
                if (downloadTo === "local") {
                    if (fs.existsSync(outputFilePath)) {
                    } else {
                        image = sharp(filePath);
                    }
                }
            }
        } else {
            const response = await fetch(url, {
                headers: {
                    Cookie: cookies || "",
                },
            });

            if (!response.ok) {
                throw new Error(
                    `Failed to download image. Status: ${response.status}`,
                );
            }

            if (!response.headers.get("content-type")?.includes("image/")) {
                throw new Error(
                    `Failed to download image. Content-Type: ${response.headers.get(
                        "content-type",
                    )}`,
                );
            }

            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Process the image
            image = sharp(buffer);
        }
    }

    if (!image) {
        throw new Error("Failed to read image.");
    }

    if (!dryRun && !hasBeenDownloaded) {
        // Output the image and convert it to its desired format
        if (downloadTo === "local") {
            await image.toFile(outputFilePath);
        } else if (downloadTo === "s3") {
            if (!aws) {
                throw new Error("AWS client not initialized.");
            }

            if (!s3Bucket) {
                throw new Error("S3 bucket not specified.");
            }

            // Download from S3
            const command = new PutObjectCommand({
                Body: await image.toBuffer(),
                ContentType: mime.getType(outputFilePath) || "image/jpeg",
                ACL: s3ACL,
                Bucket: s3Bucket,
                Key: s3Path
                    ? path.join(s3Path, outputFilePath)
                    : outputFilePath,
            });

            try {
                await aws.send(command);
            } catch (e) {
                console.error(
                    `Failed to upload image to S3: ${outputFilePath}`,
                    e,
                );
            }
        }
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
        id,
        recordId,
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
                text: `Downloading Image from ${url}`,
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
