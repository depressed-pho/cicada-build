import * as fs from "node:fs";
import * as path from "node:path";
import * as merge from "merge";
import ts from "gulp-typescript";
import { requireUncached } from "../utils.js";

export function transpileTypeScript(tsConfigPath: string) {
    const tsConfigDefault = {
        compilerOptions: {
            rootDir: ".",
            rootDirs: ["src", "dist/generated"],
            baseUrl: "src",
            module: "ES2020",
            moduleResolution: "node",
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

    return ts(tsConfig.compilerOptions);
}
