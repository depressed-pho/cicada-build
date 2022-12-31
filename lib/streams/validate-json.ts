import Vinyl from "vinyl";
import * as jsonlint from "jsonlint";
import { Buffer } from "node:buffer";
import path from "node:path";
import { readAll } from "./read-all.js";
import { Transform, TransformCallback } from "node:stream";

class ValidateJSON extends Transform {
    constructor() {
        super({objectMode: true});
    }

    override _transform(vinyl: Vinyl, enc: BufferEncoding, cb: TransformCallback) {
        if (path.extname(vinyl.path) == ".json") {
            if (vinyl.isBuffer()) {
                const e = ValidateJSON.#validateJSONBuffer(vinyl, enc, vinyl.contents);
                if (e) {
                    cb(e);
                }
                else {
                    cb(null, vinyl);
                }
            }
            else if (vinyl.isStream()) {
                readAll(vinyl.clone().contents)
                    .then(buf => {
                        const e = ValidateJSON.#validateJSONBuffer(vinyl, enc, buf);
                        if (e) {
                            cb(e);
                        }
                        else {
                            cb(null, vinyl);
                        }
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

    static #validateJSONBuffer(vinyl: Vinyl, enc: BufferEncoding, buf: Buffer): null|Error {
        /* THINKME: We should validate it against actual JSON schemata, not
         * only its well-formedness. */
        try {
            jsonlint.parse(buf.toString(enc));
            return null;
        }
        catch (e) {
            return Error(`${vinyl.path}: ${e}`);
        }
    }
}

export function validateJSON(): Transform {
    return new ValidateJSON();
}
