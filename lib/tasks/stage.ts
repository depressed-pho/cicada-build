import gulp from "gulp"; const { src } = gulp;
import { overwrite } from "../streams/overwrite.js";

/* Update everything in dist/stage by comparing its contents with
 * dist/build. This is to minimise the amount of data to be synchronised
 * with the game directory. */
export function stage() {
    return src("**", {cwd: "dist/build"})
        .pipe(overwrite("dist/stage", {compareWith: "content", verbose: false}));
}
