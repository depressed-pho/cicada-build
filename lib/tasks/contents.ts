import * as ignore from "gulp-ignore";
import * as path from "node:path";
import gulp from "gulp"; const { parallel, series, src, dest } = gulp;
import { TaskCallback } from "undertaker";
import { Project, ScriptModule } from "../project.js";
import { Vendor } from "../vendor.js";
import { Pattern, RewriteImports } from "../rewrite-imports.js";
import { compileProtobuf } from "../streams/compile-protobuf.js";
import { transpileJSON as transpile_JSON } from "../streams/transpile-json.js";
import { transpileTypeScript as transpile_TypeScript } from "../streams/transpile-typescript.js";
import { validateJSON } from "../streams/validate-json.js";

export function contents(cb: TaskCallback): void {
    const proj    = new Project("package.json", "src/manifest");
    const vendor  = new Vendor("package.json");
    const tasks   = [];

    for (const pack of proj.packs) {
        const buildPath  = pack.stagePath("dist/build");
        const genPath    = pack.stagePath("dist/generated");

        for (const mod of pack.modules) {
            const srcGlobs   = Array.from(mod.include.values());

            if (mod instanceof ScriptModule) {
                // Special case: script modules often need transpilation.

                // This is unsound. We want our vendor packages to end up
                // in dist/stage/scripts but there aren't any less terrible
                // ways than this.
                const scriptRoot = mod.entry.split(path.sep)[0];
                const vendorPath = path.join(buildPath, scriptRoot!);
                const rewrite    = new RewriteImports("src/tsconfig.json");
                rewrite.addAliases(vendor.aliases(vendorPath));

                // Add an alias from "package.json" to
                // "{scriptRoot}/package.js". This file is not necessarily
                // used but unused scripts will be removed anyway. (FIXME: Do it.)
                const pkgJsPath = path.join(vendorPath, "package.js");
                rewrite.addAliases([
                    ["package.json", [{
                        path: new Pattern(pkgJsPath),
                        isSource: false
                    }]]
                ]);

                tasks.push(
                    series(
                        parallel(
                            // We must run protoc before tsc because the
                            // compiler is going to need them.
                            function protoc() {
                                return src(srcGlobs, {cwd: "src", cwdbase: true})
                                    .pipe(ignore.include("**/*.proto"))
                                    .pipe(compileProtobuf(genPath));
                            },
                            // Also vendor run-time dependencies because
                            // RewriteImports is going to need them.
                            vendor.task(vendorPath),
                            // Translate package.json into
                            // package.js. Scripts may need it.
                            function packageJson() {
                                return src("package.json", {cwd: ".", cwdbase: true})
                                    .pipe(transpile_JSON())
                                    .pipe(dest(vendorPath));
                            }
                        ),
                        parallel(
                            function copy() {
                                return src(srcGlobs, {cwd: "src", cwdbase: true})
                                    .pipe(src(srcGlobs, {cwd: genPath, cwdbase: true}))
                                    .pipe(ignore.include("**/*.js"))
                                    .pipe(rewrite.stream(buildPath))
                                    .pipe(dest(buildPath));
                            },
                            // THINKME: Maybe support PureScript as well?
                            function transpileTypeScript() {
                                return src(srcGlobs, {cwd: "src", cwdbase: true, sourcemaps: true})
                                    .pipe(ignore.include("**/*.ts"))
                                    .pipe(transpile_TypeScript("src/tsconfig.json", genPath))
                                    .pipe(rewrite.stream(buildPath))
                                    .pipe(dest(buildPath, {sourcemaps: "."}));
                            },
                            function transpileJSON() {
                                return src(srcGlobs, {cwd: "src", cwdbase: true})
                                    .pipe(ignore.include("**/*.json"))
                                    .pipe(transpile_JSON())
                                    .pipe(dest(buildPath));
                            }
                        )
                    ));
            }
            else {
                tasks.push(
                    function copyData() {
                        return src(srcGlobs, {cwd: "src", cwdbase: true})
                            .pipe(validateJSON())
                            .pipe(dest(buildPath));
                    });
            }
        }

        tasks.push(
            function copyLicense() {
                return src("LICENSE", {allowEmpty: true})
                    .pipe(src("COPYING", {allowEmpty: true}))
                    .pipe(dest(buildPath));
            });
    }

    if (tasks.length > 0) {
        parallel(...tasks)(cb);
    }
    else {
        cb();
    }
};
