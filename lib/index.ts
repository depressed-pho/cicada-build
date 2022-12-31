import gulp from "gulp";
import { clean, manifests, icons, contents, stage, archive,
         installIfPossible } from "./tasks.js";

export { clean, distclean } from "./tasks.js";

export const build =
    gulp.series(
        clean,
        gulp.parallel(
            manifests,
            icons,
            contents
        ),
        stage,
        archive
    );

export const install =
    gulp.series(
        build,
        installIfPossible
    );

export function watch() {
    gulp.watch([
        "package.json",
        "src/**",
        "types/*"
    ], {ignoreInitial: false}, install);
};

export default build;
