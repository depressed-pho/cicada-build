import * as fs from "node:fs";
import * as path from "node:path";
import { Candidate, RewriteImports } from "./rewrite-imports.js";
import { TaskCallback, TaskFunction } from "undertaker";
import gulp from "gulp"; const { parallel, src, dest } = gulp;
import { requireUncached } from "./utils.js";

interface ModInfo {
    modPath: string;
    absDir:  string;
}

export class Vendor {
    readonly #deps: Map<string, ModInfo> // package to ModInfo

    public constructor(pkgJsonPath: string) {
        const rootMeta = requireUncached(path.resolve(pkgJsonPath));

        this.#deps = new Map();
        for (const pkg of Object.keys(rootMeta.dependencies ?? {})) {
            const metaPath = this.#resolve(pkg, path.dirname(pkgJsonPath));
            this.#populate(pkg, metaPath);
        }
    }

    #populate(pkg: string, metaPath: string): void {
        const meta = requireUncached(metaPath);
        if (meta.module) {
            const modInfo = {
                modPath: meta.module,
                absDir:  path.resolve(path.dirname(metaPath))
            };

            if (this.#deps.has(pkg) && this.#deps.get(pkg)!.absDir !== modInfo.absDir) {
                throw new Error(`We have to vendor conflicting versions of ${pkg} but we don't support that at the moment.`);
            }
            else {
                this.#deps.set(pkg, modInfo);
            }

            // The package may itself depend on other ones. Vendor them
            // recursively.
            for (const subPkg of Object.keys(meta.dependencies ?? {})) {
                const subMetaPath = this.#resolve(subPkg, path.dirname(metaPath));
                this.#populate(subPkg, subMetaPath);
            }
        }
        else {
            throw new Error(`Package ${pkg} doesn't have an ES2020 module. We don't support vendoring CommonJS modules at the moment.`);
        }
    }

    #resolve(pkg: string, pkgRoot: string): string {
        const pkgJsonPath = path.resolve(pkgRoot, "node_modules", pkg, "package.json");
        if (fs.existsSync(pkgJsonPath)) {
            return pkgJsonPath;
        }
        else {
            const parent = path.dirname(pkgRoot);
            if (parent !== pkgRoot) {
                return this.#resolve(pkg, parent);
            }
            else {
                throw new Error(`Package ${pkg} is not found anywhere. Did you really install it?`);
            }
        }
    }

    public aliases(vendorPath: string): Map<string, Candidate[]> {
        return new Map(
            Array.from(this.#deps.entries()).map(([pkg, modInfo]) => {
                return [
                    pkg,
                    [{
                        path: path.resolve(vendorPath, pkg, path.basename(modInfo.modPath)),
                        isSource: false
                    }]
                ];
            }));
    }

    public task(vendorPath: string): TaskFunction {
        // package.json doesn't tell us exactly which files are imported
        // from the main script. In theory we can parse the script and
        // discover imported modules, but ugh... we don't want to do it so
        // we instead assume that any script files in the same directory
        // tree as that of the main script are needed.
        const rewrite = new RewriteImports();
        rewrite.addAliases(this.aliases(vendorPath));

        const tasks = Array.from(this.#deps.entries()).map(([pkg, modInfo]) => {
            const absModPath = path.resolve(modInfo.absDir, modInfo.modPath);
            const destRoot   = path.join(vendorPath, pkg);
            const task       = () =>
                src("**", {cwd: path.dirname(absModPath), cwdbase: true})
                  .pipe(rewrite.stream(destRoot))
                  .pipe(dest(destRoot));
            Object.defineProperty(task, "name", {value: `vendor:${pkg}`, configurable: true});
            return task;
        });

        function vendor(cb: TaskCallback) {
            if (tasks.length > 0) {
                return parallel(...tasks)(cb);
            }
            else {
                cb();
            }
        }
        return vendor;
    }
}
