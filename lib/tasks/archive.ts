import Vinyl from "vinyl";
import { ZipFile } from "yazl";
import { Transform, TransformCallback } from "node:stream";
import gulp from "gulp"; const { src, dest } = gulp;
import { Project } from "../project.js";

class Zip extends Transform {
    readonly #path: string;
    readonly #zip: ZipFile;

    constructor(zipPath: string) {
        super({objectMode: true});

        this.#path = zipPath;
        this.#zip  = new ZipFile();
    }

    override _transform(vinyl: Vinyl, _enc: BufferEncoding, cb: TransformCallback) {
        const opts = {
            ...(vinyl.stat ? {mtime: vinyl.stat.mtime} : {}),
            ...(vinyl.stat ? {mode:  vinyl.stat.mode } : {})
        };
        const entryPath = vinyl.relative;
        if (vinyl.isDirectory()) {
            // Ignore these. They aren't necessary. And this is why we
            // don't use gulp-vinyl-zip for this.
        }
        else if (vinyl.isBuffer()) {
            this.#zip.addBuffer(vinyl.contents, entryPath, opts);
        }
        else if (vinyl.isStream()) {
            this.#zip.addReadStream(vinyl.contents, entryPath, opts);
        }
        cb();
    }

    override _flush(cb: TransformCallback) {
        this.push(new Vinyl({ path: this.#path, contents: this.#zip.outputStream }));
        // @ts-ignore: Wrong TS signature for ZipFile.prototype.end in @types/yazl
        this.#zip.end(() => cb());
    }
}

export function archive() {
    const proj = new Project("package.json", "src/manifest");

    return src("**", {cwd: "dist/stage"})
        .pipe(new Zip(proj.archiveName))
        .pipe(dest("dist"));
}
