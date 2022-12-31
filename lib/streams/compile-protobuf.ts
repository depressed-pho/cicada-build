import Vinyl from "vinyl";
import fancyLog from "fancy-log";
import * as path from "node:path";
import npmWhich from "npm-which";
import { Writable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";

const which = npmWhich(process.cwd());

class CompileProtobuf extends Writable {
    readonly #destDir: string;
    #protoc: string|null;

    constructor(destDir: string) {
        super({objectMode: true});
        this.#destDir = destDir;
        this.#protoc  = null;
    }

    override _write(vinyl: Vinyl, _enc: BufferEncoding, cb: (e?: Error|null) => void) {
        this.#compile(vinyl)
            .then(() => cb(), e => { console.error(e); cb(e) });
    }

    async #compile(vinyl: Vinyl): Promise<void> {
        if (this.#protoc == null) {
            this.#protoc = await promisify(which)("protoc") as string;
        }

        // FIXME: Write the vinyl to a temporary file if it isn't a real
        // on-disk file.
        const destDir = path.resolve(this.#destDir, path.dirname(vinyl.relative));
        await mkdir(destDir, {recursive: true});

        const { stdout, stderr } = await promisify(execFile)(
            this.#protoc!, [
                "--ts_out", destDir,
                "--ts_opt", "ts_nocheck",
                "--proto_path", path.dirname(vinyl.path),
                vinyl.path
            ]);
        if (stderr != "") {
            fancyLog.warn(stderr);
        }
        if (stdout != "") {
            fancyLog.info(stdout);
        }
    }
}

export function compileProtobuf(destDir: string): Writable {
    return new CompileProtobuf(destDir);
}
