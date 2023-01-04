import Vinyl from "vinyl";
import * as fs from "node:fs";
import * as path from "node:path";
import { inspect } from "node:util";
import { Transform, TransformCallback } from "node:stream";
import { readAll } from "./streams/read-all.js";
import { requireUncached } from "./utils.js";

export class Pattern {
    readonly #left:   string;
    readonly #right?: string;

    constructor(patStr: string) {
        const wildPos = patStr.indexOf("*");
        if (wildPos >= 0) {
            this.#left  = patStr.substring(0, wildPos);
            this.#right = patStr.substring(wildPos + 1);
            if (this.#right.includes("*")) {
                throw new Error(`A pattern can have at most one wildcard '*': ${patStr}`);
            }
        }
        else {
            this.#left = patStr;
        }
    }

    get hasWildcard(): boolean {
        return this.#right !== undefined;
    }

    toString(): string {
        return this.replaceWildcard("*");
    }

    replaceWildcard(str: string): string {
        if (this.#right !== undefined) {
            return this.#left + str + this.#right;
        }
        else {
            return this.#left;
        }
    }

    /** Like RegExp.prototype.exec, this returns [matched, ...captured] on a
     * successful match, or null on a failed one. */
    exec(str: string): string[]|null {
        if (str.startsWith(this.#left)) {
            if (this.#right !== undefined) {
                // The pattern has a wildcard.
                if (str.endsWith(this.#right)) {
                    const captured = str.slice(this.#left.length, -1 * this.#right.length);
                    return [str, captured];
                }
                else {
                    return null;
                }
            }
            else {
                return [str];
            }
        }
        else {
            return null;
        }
    }
}

export interface Candidate {
    path:     Pattern;
    isSource: boolean; // Whether the path points at a source file or a destination file.
}

export class RewriteImports {
    readonly #aliasBase: string;
    /** A map from pattern to candidates, relative candidates are relative
     * to #aliasBase. */
    readonly #aliases:   Map<string, Candidate[]>;

    public constructor();
    public constructor(tsConfigPath: string);
    public constructor(aliasBase: string, aliases: Map<string, Candidate[]>);
    public constructor(...args: any[]) {
        switch (args.length) {
        case 0:
            this.#aliasBase = "/nonexistent";
            this.#aliases   = new Map();
            break;
        case 1:
            // new RewriteImports("src/tsconfig.json")
            if (fs.existsSync(args[0])) {
                const tsConfig = requireUncached(path.resolve(args[0]));
                this.#aliasBase = tsConfig.compilerOptions?.baseUrl ?? "/nonexistent";
                this.#aliases   = new Map(
                    Object
                        .entries(tsConfig.compilerOptions?.paths ?? [])
                        .map((([name, candidates]: [string, string[]]) => {
                            return [
                                name,
                                candidates.map(path => {
                                    return {
                                        path: new Pattern(path),
                                        isSource: true
                                    };
                                })
                            ];
                        }) as any));
            }
            else {
                this.#aliasBase = "/nonexistent";
                this.#aliases   = new Map();
            }
            break;
        case 2:
            // new RewriteImports(aliasBase, aliases)
            this.#aliasBase = args[0];
            this.#aliases   = args[1];
            break;
        default:
            throw new TypeError("wrong number of arguments");
        }
    }

    public addAliases(aliases: Iterable<[string, Candidate[]]>): void {
        for (const [from, to] of aliases) {
            const cands0 = this.#aliases.get(from) ?? [];
            const cands1 = cands0.concat(to);
            this.#aliases.set(from, cands1);
        }
    }

    public stream(destRoot: string): Transform {
        return new RewriteImportsImpl(this.#aliasBase, this.#aliases, destRoot);
    }
}

class RewriteImportsImpl extends Transform {
    readonly #aliasBase: string;
    readonly #aliases:   Map<string, Candidate[]>;
    readonly #destRoot:  string;

    constructor(aliasBase: string, aliases: Map<string, Candidate[]>, destRoot: string) {
        super({objectMode: true});
        this.#aliasBase = aliasBase;
        this.#aliases   = aliases;
        this.#destRoot  = destRoot;
    }

    override _transform(vinyl: Vinyl, enc: BufferEncoding, cb: TransformCallback): void {
        // THINKME: We should probably update source
        // maps. gulp-transform-js-ast does that, but we can't use it
        // because it is heavily outdated and cannot parse modern ES.

        const srcPath  = vinyl.path;
        const destPath = path.resolve(this.#destRoot, vinyl.relative);
        if (vinyl.isBuffer()) {
            try {
                vinyl.contents = this.#rewriteBuffer(srcPath, destPath, vinyl.contents, enc);
                cb(null, vinyl);
            }
            catch (e) {
                cb(e as any);
            }
        }
        else if (vinyl.isStream()) {
            readAll(vinyl.clone().contents)
                .then(buf => {
                    vinyl.contents = this.#rewriteBuffer(srcPath, destPath, buf, enc) as any;
                    cb(null, vinyl);
                })
                .catch(e => cb(e));
        }
        else {
            cb(null, vinyl);
        }
    }

    #rewriteBuffer(srcPath: string, destPath: string, buf: Buffer, enc: BufferEncoding): Buffer {
        const sourceInput = buf.toString(enc);

        // NOTE: We want to use recast
        // (https://www.npmjs.com/package/recast) but we can't, since it
        // cannot handle some of modern ES syntaxes we use. So... the
        // "solution" is to apply a damn RegExp transformation.
        const sourceOutput = sourceInput.replaceAll(
            /(import|export)(?:(.*?)from)?\s*(?:"([^"]+)"|'([^']+)')/g,
            (_match, impExp, locals, dqPath, sqPath) => {
                const origPath = dqPath != null ? dqPath : sqPath;
                const newPath  = this.#rewritePath(origPath, srcPath, destPath);
                if (locals == null) {
                    return `${impExp} "${newPath}"`;
                }
                else {
                    return `${impExp}${locals}from "${newPath}"`;
                }
            });

        return Buffer.from(sourceOutput, enc);
    }

    #rewritePath(origPath: string, srcPath: string, destPath: string): string {
        if (origPath.startsWith(".")) {
            return this.#rewriteRelativePath(origPath, srcPath);
        }
        else if (origPath.startsWith("@minecraft/")) {
            // Special case: we don't need to rewrite system modules native
            // to Minecraft Bedrock.
            return origPath;
        }
        else {
            return this.#rewriteSymbolicPath(origPath, srcPath, destPath);
        }
    }

    #rewriteRelativePath(origPath: string, srcPath: string): string {
        const base     = path.resolve(path.dirname(srcPath), origPath);
        const resolved = this.#resolve(origPath, srcPath, base);
        if (resolved != null) {
            return resolved;
        }
        else {
            // A special case: the referred file may reside in a different
            // root directory or is maybe not generated/copied yet.
            return origPath;
        }
    }

    #rewriteSymbolicPath(origPath: string, srcPath: string, destPath: string): string {
        for (const [from, to] of this.#aliases) {
            const match = new Pattern(from).exec(origPath);
            if (!match) {
                continue;
            }
            else if (match.length == 1) {
                // Exact match
                for (const candidate of to) {
                    if (candidate.path.hasWildcard) {
                        throw new Error(`Invalid path candidate: ${candidate.path}`);
                    }
                    const base     = path.resolve(this.#aliasBase, candidate.path.toString());
                    const resolved = candidate.isSource
                          ? this.#resolve(origPath, srcPath, base)
                          : this.#resolve(origPath, destPath, base);
                    if (resolved != null) {
                        return resolved;
                    }
                }
                throw new Error(`${srcPath}: Module ${origPath} not found in ${inspect(to)}`);
            }
            else {
                // Wildcard match
                const wildcarded = match[1]!;

                for (const candidate of to) {
                    if (!candidate.path.hasWildcard) {
                        throw new Error(`Invalid path candidate: ${candidate.path}`);
                    }
                    const replaced = candidate.path.replaceWildcard(wildcarded);
                    const base     = path.resolve(this.#aliasBase, replaced);
                    const resolved = candidate.isSource
                          ? this.#resolve(origPath, srcPath, base)
                          : this.#resolve(origPath, destPath, base);
                    if (resolved != null) {
                        return resolved;
                    }
                }
                throw new Error(`${srcPath}: Module ${origPath} not found in ${inspect(to)}`);
            }
        }
        throw new Error(`${srcPath}: Module ${origPath} not found in the alias table or in dependencies`);
    }

    #resolve(origPath: string, srcPath: string, base: string): string|null {
        function toRelative(from: string, to: string): string {
            const relative = path.relative(from, to);
            if (relative.startsWith("./") || relative.startsWith("../")) {
                return relative;
            }
            else {
                return "./" + relative;
            }
        }

        if (fs.existsSync(base)) {
            return toRelative(path.dirname(srcPath), base);
        }
        else if (fs.existsSync(base + ".d.ts")) {
            // No need to rewrite this.
            return origPath;
        }
        else if (fs.existsSync(base + ".ts") || fs.existsSync(base + ".js")) {
            return toRelative(path.dirname(srcPath), base + ".js");
        }
        else {
            return null;
        }
    }
}
