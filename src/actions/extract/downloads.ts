import {Buffer} from "node:buffer";
import * as fs from "node:fs";
import type {IncomingMessage} from "node:http";
import * as path from "node:path";
import * as nodeUrl from "node:url";
import {GetObjectCommand, PutObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {eq, sql} from "drizzle-orm";
import mime from "mime/lite";
import ora from "ora";
import sharp, {type Sharp} from "sharp";

import type {Download, NewDownload, NewRecord} from "../../shared/schema.js";
import {downloads} from "../../shared/schema.js";
import type {
    ExtractAction,
    InternalOptions,
    Playscrape,
    S3Options,
} from "../../shared/types.js";
import {hash, wait} from "../../shared/utils.js";
import type {DomQuery} from "./dom-query.js";

let s3Client: S3Client | null = null;

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
    format = "jpg",
}: {
    url: string;
    format?: string;
}) => {
    const isLocalFile = !url.startsWith("http");
    let id = "";
    let origFileName = "";

    if (isLocalFile) {
        if (!url.startsWith("file://") && !url.startsWith("/")) {
            throw new Error("Local file must be an absolute path.");
        }

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

    return {id, fileName, isLocalFile};
};

const getAWS = (s3: S3Options) => {
    if (s3Client) {
        return s3Client;
    }

    if (!s3?.Bucket) {
        throw new Error("S3 bucket not specified.");
    }

    s3Client = new S3Client();

    return s3Client;
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
    options: InternalOptions;
}): Promise<NewDownload> => {
    const {format, dryRun, imageDir, overwrite, downloadTo, s3} = options;
    const {id, fileName, isLocalFile} = getImageIdAndFileName({
        url,
        format,
    });
    const localFilePath = imageDir ? path.join(imageDir, fileName) : fileName;
    let image: Sharp | null = null;
    let hasBeenDownloaded = false;

    // Check to see if the image has already been downloaded

    if (!overwrite) {
        if (downloadTo === "local" || !downloadTo) {
            if (fs.existsSync(localFilePath)) {
                try {
                    image = sharp(localFilePath);
                    hasBeenDownloaded = true;
                } catch (e) {
                    console.error(`Failed to read image: ${localFilePath}`, e);
                }
            }
        } else if (downloadTo === "s3" && s3) {
            const aws = getAWS(s3);

            // Download from S3
            const Key = s3?.pathPrefix
                ? path.join(s3?.pathPrefix, fileName)
                : fileName;
            const command = new GetObjectCommand({
                Key,
                ...s3,
            });

            try {
                const {Body} = await aws.send(command);

                if (Body) {
                    const stream = Body as IncomingMessage;
                    const buffers: Array<any> = [];

                    for await (const chunk of stream) {
                        buffers.push(chunk);
                    }

                    image = sharp(Buffer.concat(buffers));
                    hasBeenDownloaded = true;
                }
            } catch (e) {
                console.error(`Failed to download image from S3: ${Key}`, e);
            }
        }
    }

    if (!image) {
        if (isLocalFile) {
            const filePath = url.startsWith("file://")
                ? nodeUrl.fileURLToPath(url)
                : url;

            if (!fs.existsSync(filePath)) {
                throw new Error(`File does not exist: ${filePath}`);
            }

            if (overwrite) {
                if (downloadTo === "local") {
                    if (fs.existsSync(localFilePath)) {
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
            await image.toFile(localFilePath);
        } else if (downloadTo === "s3" && s3) {
            const aws = getAWS(s3);

            // Download from S3
            const Key = s3?.pathPrefix
                ? path.join(s3?.pathPrefix, fileName)
                : fileName;
            const command = new PutObjectCommand({
                Body: await image.toBuffer(),
                ContentType: mime.getType(localFilePath) || "image/jpeg",
                Key,
                ...s3,
            });

            try {
                await aws.send(command);
            } catch (e) {
                console.error(`Failed to upload image to S3: ${Key}`, e);
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
    content,
    cookies,
    playscrape,
    options,
    domQuery,
}: {
    action: ExtractAction;
    record: NewRecord;
    url: string;
    content: string;
    cookies: string | null;
    playscrape: Playscrape;
    options: InternalOptions;
    domQuery: DomQuery;
}) => {
    const {db} = playscrape;
    const {delay, indent, dryRun, test} = options;

    if (!action.downloadImages) {
        return;
    }

    const urls = await action.downloadImages({
        ...domQuery,
        record,
        url,
        content,
    });

    if (test) {
        return;
    }

    if (urls.length === 0) {
        console.warn("No images to download.");
        return;
    }

    for (const url of urls) {
        const downloadImageSpinner = ora({
            text: `Downloading Image from ${url}`,
            indent,
        }).start();
        const {id} = getImageIdAndFileName({url});
        const existingDownload: Download | undefined =
            await db.query.downloads.findFirst({
                where: eq(downloads.id, id),
            });

        if (existingDownload) {
            downloadImageSpinner.succeed(`Image already downloaded: ${url}`);
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
                        updated_at: sql`now()`,
                    },
                });

            downloadImageSpinner.succeed(`Image downloaded: ${url}`);
        }
    }
};
