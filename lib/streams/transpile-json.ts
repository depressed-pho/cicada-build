import Vinyl from "vinyl";
import { Buffer } from "node:buffer";
import path from "node:path";
import { readAll } from "./read-all.js";
import { Transform, TransformCallback } from "node:stream";

class TranspileJSON extends Transform {
    constructor() {
        super({objectMode: true});
    }

    override _transform(vinyl: Vinyl, enc: BufferEncoding, cb: TransformCallback) {
        if (path.extname(vinyl.path) == ".json") {
            if (vinyl.isBuffer()) {
                const e = TranspileJSON.#transpileJSONBuffer(vinyl, enc, vinyl.contents);
                if (e)
                    cb(e);
                else
                    cb(null, vinyl);
            }
            else if (vinyl.isStream()) {
                readAll(vinyl.clone().contents)
                    .then(buf => {
                        const e = TranspileJSON.#transpileJSONBuffer(vinyl, enc, buf);
                        if (e)
                            cb(e);
                        else
                            cb(null, vinyl);
                    })
                    .catch(e => cb(e));
            }
            else {
                cb(null, vinyl);
            }
        }
        else {
            cb(null, vinyl);
        }
    }

    static #transpileJSONBuffer(vinyl: Vinyl, enc: BufferEncoding, buf: Buffer): null|Error {
        const basename = path.basename(vinyl.path, ".json");
        try {
            const json = JSON.parse(buf.toString(enc));
            const js   = `export default ${JSON.stringify(json)};`;

            vinyl.path     = path.join(path.dirname(vinyl.path), basename + ".js");
            vinyl.contents = Buffer.from(js);

            return null;
        }
        catch (e) {
            return new Error(`${vinyl.path}: ${e}`);
        }
    }
}

export function transpileJSON(): Transform {
    return new TranspileJSON();
}
