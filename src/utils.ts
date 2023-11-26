import {createHash} from "node:crypto";

export const wait = (timeout: number) =>
    new Promise<void>((resolve) => {
        setTimeout(() => {
            resolve();
        }, timeout);
    });

export const hash = (data: string) =>
    createHash("md5").update(data).digest("hex");
