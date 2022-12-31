import { Buffer } from "node:buffer";
import * as path from "node:path";
import * as process from "node:process";
import fancyLog from "fancy-log";
import isPng from "is-png";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { Project } from "../project.js";

export async function icons() {
    const proj = new Project("package.json", "src/manifest");

    // Use node-png to see if the source icon is already a PNG image
    // suitable for the pack icon, and copy it verbatim. By suitable it
    // means the image is square and 256x256 at maximum, or at least the
    // number is a power of 2. If not we use the gm module to convert it
    // but it depends on GraphicsMagick externally installed to the system.
    for (const pack of proj.packs) {
        if (pack.icon != null) {
            const buildPath = pack.stagePath("dist/build");
            await mkdir(buildPath, {recursive: true});

            const rel = path.relative(process.cwd(), pack.icon);
            const buf = await readFile(pack.icon);
            const dst = path.resolve(buildPath, "pack_icon.png");
            if (isPng(buf)) {
                const size = await pngSize(buf);
                if (size.width == size.height) {
                    if (size.width > 256) {
                        fancyLog.info(
                            `${rel} is ${size.width}x${size.height} but `+
                                `pack icons should be no larger than 256x256. Resizing...`);
                        await writeImage(dst, buf, {width: 256, height: 256});
                    }
                    else {
                        // PNG, square, not larger than 256x256. A perfect
                        // source.
                        await writeFile(dst, buf);
                    }
                }
                else {
                    throw new Error(
                        `${rel} is ${size.width}x${size.height} but `+
                            `pack icons must be square.`);
                }
            }
            else {
                const size = await gmSize(buf);
                if (size.width == size.height) {
                    if (size.width > 256) {
                        fancyLog.info(
                            `${rel} is ${size.width}x${size.height} but `+
                                `pack icons should be no larger than 256x256. Resizing...`);
                        await writeImage(dst, buf, {width: 256, height: 256});
                    }
                    else {
                        fancyLog.info(
                            `${rel} is not a PNG image. Converting...`);
                        await writeImage(dst, buf);
                    }
                }
                else {
                    throw new Error(
                        `${rel} is ${size.width}x${size.height} but `+
                            `pack icons must be square.`);
                }
            }
        }
    }
}

interface Dimension {
    width: number;
    height: number;
}

async function pngSize(buf: Buffer): Promise<Dimension> {
    const pngjs = await import("pngjs");
    return new Promise((resolve, reject) => {
        const png = new pngjs.PNG();
        png.on("error", reject);
        png.on("metadata", meta => resolve(meta));
        png.parse(buf);
    });
}

async function gmSize(buf: Buffer): Promise<Dimension> {
    const gm = (await import("gm")).default;
    return new Promise((resolve, reject) => {
        gm(buf).size((err, size) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(size);
            }
        });
    });
}

async function writeImage(dst: string, buf: Buffer, size?: Dimension): Promise<void> {
    const gm = (await import("gm")).default;
    return new Promise((resolve, reject) => {
        const img = size ? gm(buf).resize(size.width, size.height) : gm(buf);
        img.write(dst, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}
