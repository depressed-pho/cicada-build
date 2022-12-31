import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";
import fancyLog from "fancy-log";
import { readdir, readFile, rename } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import gulp from "gulp"; const { src } = gulp;
import { overwrite } from "../streams/overwrite.js";
import { Project } from "../project.js";
import * as dotenv from "dotenv";

dotenv.config();

export async function installIfPossible(): Promise<void> {
    const comMojangPath = process.env["MC_COM_MOJANG_PATH"];

    if (comMojangPath == undefined) {
        fancyLog.warn(
            "`com.mojang' directory path has not been set. " +
            "In order to install packs to Minecraft, create a file named " +
            "`.env' on the root of the repository, and put the following " +
            "line to the file:"
        );
        fancyLog.warn(
            "MC_COM_MOJANG_PATH=\"/path/to/com.mojang\"");
    }
    else if (!fs.existsSync(comMojangPath)) {
        fancyLog.warn(
            "MC_COM_MOJANG_PATH points at a non-existent directory: " + comMojangPath);
    }
    else {
        const proj = new Project("package.json", "src/manifest");
        for (const pack of proj.packs) {
            const stagePath       = pack.stagePath("dist/stage");
            const installRootPath = pack.installRootPath(comMojangPath);
            const installPath     = pack.installPath(comMojangPath);

            // Now this is the most dangerous part. We have a root
            // directory where packs are installed. Before installing our
            // pack there, we must look for a pack that has the same UUID
            // as ours, and overwrite it if it exists.
            for (const dirent of await readdir(installRootPath, {withFileTypes: true})) {
                if (dirent.isDirectory()) {
                    const packPath = path.resolve(installRootPath, dirent.name);
                    const maniPath = path.resolve(packPath, "manifest.json");
                    if (!fs.existsSync(maniPath)) {
                        fancyLog.warn(`Manifest file missing: ${maniPath}`);
                        continue;
                    }

                    const manifest = JSON.parse((await readFile(maniPath)).toString());
                    if (typeof manifest             === "object" &&
                        typeof manifest.header      === "object" &&
                        typeof manifest.header.uuid === "string" &&
                        manifest.header.uuid        === pack.uuid) {

                        if (packPath != installPath) {
                            fancyLog.info(`Renaming: ${packPath} -> ${installPath}`);
                            await rename(packPath, installPath);
                        }
                        break;
                    }
                }
            }

            // Copy everything from the staging directory, and remove any
            // existing files that are missing from the staging
            // directory. The reason why don't take the easiest path,
            // removing everything and then copying files, is that the game
            // directory is typically mounted via a slow link (except on
            // Windows) and wasting the bandwidth incurs a huge performance
            // penalty.
            fancyLog.info(`Installing: ${installPath}`);
            await pipeline(
                src("**", {cwd: stagePath}),
                overwrite(installPath, {compareWith: "mtime", verbose: false})
            );
        }
    }
};
