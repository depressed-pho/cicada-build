import * as fs from "node:fs";
import * as ignore from "gulp-ignore";
import * as path from "node:path";
import { Candidate, Pattern, RewriteImports } from "./rewrite-imports.js";
import { TaskCallback, TaskFunction } from "undertaker";
import gulp from "gulp"; const { parallel, src, dest } = gulp;
import { requireUncached } from "./utils.js";

const EXCLUDED_PACKAGES_BY_DEFAULT = [
    "patch-package",
];

interface PkgInfo {
    files:   Set<string>;
    exports: Map<string, string>;
    absDir:  string;
}

export class Vendor {
    readonly #deps: Map<string, PkgInfo>; // pkgname to PkgInfo
    readonly #excluded: Set<string>; // pkgname

    public constructor(pkgJsonPath: string, exclude?: string[]) {
        const rootMeta = requireUncached(path.resolve(pkgJsonPath));

        this.#deps = new Map();
        this.#excluded = new Set([...EXCLUDED_PACKAGES_BY_DEFAULT, ...(exclude ?? [])]);

        for (const pkg of Object.keys(rootMeta.dependencies ?? {})) {
            if (this.#excluded.has(pkg))
                continue;
            const metaPath = this.#resolve(pkg, path.dirname(pkgJsonPath));
            this.#populate(pkg, metaPath);
        }
    }

    #populate(pkg: string, metaPath: string): void {
        const meta = requireUncached(metaPath);
        if (meta.module || (meta.type == "module" && meta.exports)) {
            const pkgInfo = {
                files:   new Set<string>,
                exports: new Map<string, string>(),
                absDir:  path.resolve(path.dirname(metaPath))
            };
            if (typeof meta.exports === "string") {
                pkgInfo.exports.set(".", meta.exports);
            }
            else if (typeof meta.exports === "object") {
                for (const [from, to] of Object.entries(meta.exports)) {
                    if (typeof to === "string") {
                        pkgInfo.exports.set(from, to);
                    }
                    else {
                        throw new Error(`${pkg}: non-string "exports" maps are currently not supported`);
                    }
                }
            }
            else {
                pkgInfo.exports.set(".", meta.module);
            }
            /* pkgInfo.files should include every .js file that are
             * transitively imported from any modules in
             * pkgInfo.exports. We don't know what files are, so we assume
             * everything is imported if it resides in a directory tree in
             * which at least one exported module resides. */
            for (const to of pkgInfo.exports.values()) {
                pkgInfo.files.add(path.join(path.dirname(to), "**"));
            }

            if (this.#deps.has(pkg) && this.#deps.get(pkg)!.absDir !== pkgInfo.absDir) {
                throw new Error(`We have to vendor conflicting versions of ${pkg} but we don't support that at the moment.`);
            }
            else {
                this.#deps.set(pkg, pkgInfo);
            }

            // The package may itself depend on other ones. Vendor them
            // recursively.
            for (const subPkg of Object.keys(meta.dependencies ?? {})) {
                if (this.#excluded.has(pkg))
                    continue;
                const subMetaPath = this.#resolve(subPkg, path.dirname(metaPath));
                this.#populate(subPkg, subMetaPath);
            }
        }
        else if (meta.main || meta.exports) {
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
            Array.from(this.#deps.entries()).flatMap(([pkg, pkgInfo]) => {
                return Array.from(pkgInfo.exports.entries()).map(([from, to]) => {
                    return [
                        path.join(pkg, from),
                        [{
                            path: new Pattern(path.join(vendorPath, pkg, to)),
                            isSource: false
                        }]
                    ];
                });
            }));
    }

    public task(vendorPath: string): TaskFunction {
        const rewrite = new RewriteImports();
        rewrite.addAliases(this.aliases(vendorPath));

        const tasks = Array.from(this.#deps.entries()).map(([pkg, pkgInfo]) => {
            const destRoot   = path.join(vendorPath, pkg);
            const task       = () =>
                src("**", {cwd: pkgInfo.absDir, cwdbase: true})
                    .pipe(ignore.include(Array.from(pkgInfo.files.values())))
                    .pipe(ignore.include("**/*.js")) // We are only going to import *.js, nothing else
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
