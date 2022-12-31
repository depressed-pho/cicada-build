import gulp from "gulp";
import ts from "gulp-typescript";
import { rm } from "node:fs/promises";

export async function clean() {
    await rm("dist", {force: true, recursive: true});
}

export const build =
    gulp.series(
        clean,
        function transpile() {
            return gulp.src("lib/**/*.ts", {sourcemaps: true})
                .pipe(ts("tsconfig.json"))
                .pipe(gulp.dest("dist", {sourcemaps: "."}));
        },
        function copyJSON() {
            return gulp.src("lib/**/*.json")
                .pipe(gulp.dest("dist"));
        });

export function watch() {
    gulp.watch([
        "lib/**",
        "package.json",
        "tsconfig.json"
    ], {ignoreInitial: false}, build);
}

export default build;
