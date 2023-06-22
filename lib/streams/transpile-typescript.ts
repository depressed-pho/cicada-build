import * as fs from "node:fs";
import * as path from "node:path";
import * as merge from "merge";
import ts from "gulp-typescript";
import { requireUncached } from "../utils.js";

const projects = new Map();
export function transpileTypeScript(tsConfigPath: string, genPath: string) {
    let proj = projects.get(tsConfigPath);
    if (!proj) {
        const tsConfigDefault = {
            compilerOptions: {
                rootDir: ".",
                rootDirs: ["src", genPath],
                baseUrl: "src",
                module: "ES2020",
                moduleResolution: "nodenext",
                paths:  {},
                target: "ES2022",
                explainFiles: true
            }
        };
        const tsConfig = merge.recursive(
            true,
            tsConfigDefault,
            fs.existsSync(tsConfigPath)
                ? requireUncached(path.resolve(tsConfigPath))
                : {});
        proj = ts.createProject(tsConfig.compilerOptions);
        projects.set(tsConfigPath, proj);
    }
    return proj();
}
