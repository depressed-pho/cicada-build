import fancyLog from "fancy-log";
import { Writable } from "node:stream";
import { chmod, lstat, mkdir, readdir, readlink,
        rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import Vinyl from "vinyl";
import { readAll } from "./read-all.js";

export interface OverwriteOptions {
    compareWith?: "content"|"mtime";
    dryRun?:      boolean;
    verbose?:     boolean;
}

class Overwrite extends Writable {
    readonly #destDir:  string;
    readonly #destTree: Map<string, fs.Stats>;
    readonly #opts:     Required<OverwriteOptions>;

    constructor(destDir: string, opts: OverwriteOptions = {}) {
        super({objectMode: true});
        this.#destDir  = destDir;
        this.#destTree = new Map();
        this.#opts     = {
            compareWith: "mtime",
            dryRun:      false,
            verbose:     false,
            ...opts
        };
        if (this.#opts.dryRun) {
            this.#opts.verbose = true;
        }
    }

    override _construct(cb: (e?: Error|null) => void) {
        this.#scanDest()
            .then(() => cb(), e => cb(e));
    }

    override _write(vinyl: Vinyl, _enc: BufferEncoding, cb: (e?: Error|null) => void) {
        this.#overwrite(vinyl)
            .then(() => cb(), e => cb(e));
    }

    override _final(cb: (e?: Error|null) => void) {
        this.#removeRemaining()
            .then(() => cb(), e => cb(e));
    }

    async #scanDest(): Promise<void> {
        this.#destTree.clear();

        if (fs.existsSync(this.#destDir)) {
            // Is it really a directory?
            const st = await lstat(this.#destDir);
            if (st.isDirectory()) {
                await this.#scanDir(this.#destDir);
            }
            else {
                // No. Remove it and create a directory.
                await this.#rm(this.#destDir)
                await this.#mkdir(this.#destDir);
            }
        }
    }

    async #scanDir(dirPath: string): Promise<void> {
        for await (const name of await readdir(dirPath)) {
            const entPath = path.resolve(dirPath, name);
            const st      = await lstat(entPath);

            this.#destTree.set(entPath, st);
            if (st.isDirectory()) {
                await this.#scanDir(entPath);
            }
        }
    }

    async #overwrite(vinyl: Vinyl): Promise<void> {
        const absPath = path.resolve(this.#destDir, vinyl.relative);
        const stNew   = vinyl.stat!;

        // Is there an existing file with the same path?
        const stOld = this.#destTree.get(absPath);
        if (stOld) {
            if (vinyl.isDirectory()) {
                if (stOld.isDirectory()) {
                    // We can reuse an existing directory. We only need to
                    // update its permission bits.
                    if (stNew.mode != stOld.mode) {
                        await this.#chmod(absPath, stNew.mode);
                    }
                }
                else {
                    // We need it to be a directory but there is an
                    // existing non-directory there.
                    await this.#rm(absPath);
                    await this.#mkdir(absPath, stNew.mode);
                }
            }
            else if (vinyl.isSymbolic()) {
                if (!stOld.isSymbolicLink() ||
                    await readlink(absPath) !== vinyl.symlink) {

                    // Not a symlink, or a wrong destination.
                    await this.#rm(absPath);
                    await this.#symlink(absPath, vinyl.symlink!);
                }
            }
            else {
                if (stOld.isFile()) {
                    if (await this.#isOutdatedFile(vinyl)) {
                        // There is an existing regular file there, but
                        // it's an outdated one.
                        await this.#rm(absPath);
                        await this.#writeFile(absPath, vinyl.contents!, stNew.mode);
                    }
                    else {
                        // We can reuse an existing file. We only need to
                        // update its permission bits.
                        if (stNew.mode != stOld.mode) {
                            await this.#chmod(absPath, stNew.mode);
                        }

                        if (this.#opts.verbose) {
                            fancyLog.info(`keep: ${absPath}`);
                        }
                    }
                }
                else {
                    // We need it to be a regular file but it's something
                    // different.
                    await this.#rm(absPath);
                    await this.#writeFile(absPath, vinyl.contents!, stNew.mode);
                }
            }
            this.#destTree.delete(absPath);
        }
        else {
            const parentPath = path.dirname(absPath);
            if (!fs.existsSync(parentPath)) {
                await this.#mkdir(parentPath);
            }

            if (vinyl.isDirectory()) {
                await this.#mkdir(absPath);
            }
            else if (vinyl.isSymbolic()) {
                await this.#symlink(absPath, vinyl.symlink!);
            }
            else {
                await this.#writeFile(absPath, vinyl.contents!, stNew.mode);
            }
        }
    }

    async #isOutdatedFile(vinyl: Vinyl): Promise<boolean> {
        const absPath = path.resolve(this.#destDir, vinyl.relative);

        switch (this.#opts.compareWith) {
        case "content":
            const dOld = await this.#digest(vinyl);
            const dNew = await this.#digest(new Vinyl({
                path:     absPath,
                contents: fs.createReadStream(absPath)
            }));
            return dOld.compare(dNew) != 0;

        case "mtime":
            const stOld = this.#destTree.get(absPath)!;
            const stNew = vinyl.stat!;
            return stOld.mtime < stNew.mtime;

        default:
            throw new Error("Unknown comparison mode: ${this.#opts.compareWith}");
        }
    }

    async #digest(vinyl: Vinyl): Promise<Buffer> {
        const hash = createHash("sha1");

        if (vinyl.isBuffer()) {
            hash.update(vinyl.contents);
            return hash.digest();
        }
        else if (vinyl.isStream()) {
            return await readAll(vinyl.contents.pipe(hash));
        }
        else {
            throw new Error("Cannot digest a null vinyl");
        }
    }

    async #removeRemaining(): Promise<void> {
        for (const path of this.#destTree.keys()) {
            await this.#rm(path);
        }
    }

    async #chmod(path: string, mode: number): Promise<void> {
        if (this.#opts.verbose) {
            fancyLog.info(`chmod ${mode}: ${path}`);
        }
        if (!this.#opts.dryRun) {
            await chmod(path, mode);
        }
    }

    async #mkdir(path: string, mode = 0o777): Promise<void> {
        if (this.#opts.verbose) {
            fancyLog.info(`mkdir ${mode}. ${path}`);
        }
        if (!this.#opts.dryRun) {
            await mkdir(path, {mode: mode, recursive: true});
        }
    }

    async #rm(path: string): Promise<void> {
        if (this.#opts.verbose) {
            fancyLog.info(`rm -rf: ${path}`);
        }
        if (!this.#opts.dryRun) {
            await rm(path, {recursive: true});
        }
    }

    async #symlink(dest: string, src: string): Promise<void> {
        if (this.#opts.verbose) {
            fancyLog.info(`symlink: \`${src}' -> \`${dest}'`);
        }
        if (!this.#opts.dryRun) {
            await symlink(dest, src);
        }
    }

    async #writeFile(path: string, data: Uint8Array|NodeJS.ReadableStream, mode: number): Promise<void> {
        if (this.#opts.verbose) {
            fancyLog.info(`write ${mode}: ${path}`);
        }
        if (!this.#opts.dryRun) {
            await writeFile(path, data, {mode});
        }
    }
}

export function overwrite(destDir: string, opts?: OverwriteOptions): Writable {
    return new Overwrite(destDir, opts);
}
