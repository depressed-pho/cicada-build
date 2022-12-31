import * as path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { Project } from "../project.js";

export async function manifests() {
    const proj = new Project("package.json", "src/manifest");

    for (const pack of proj.packs) {
        const buildPath = pack.stagePath("dist/build");
        await mkdir(buildPath, {recursive: true});

        const maniStr = JSON.stringify(pack.manifest, null, 4) + "\n";
        await writeFile(path.resolve(buildPath, "manifest.json"), maniStr);
    }
}
