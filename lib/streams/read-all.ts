import { Buffer } from "node:buffer";
import { Writable, WritableOptions } from "node:stream";

class StreamReader extends Writable {
    readonly result: any[] = [];

    constructor(opts?: WritableOptions) {
        super(opts);
    }

    override _write(chunk: any, _enc: BufferEncoding, cb: (e?: Error|null) => void): void {
        if (chunk) {
            this.result.push(chunk);
        }
        cb();
    }
}

export function readAll(src: NodeJS.ReadableStream): Promise<Buffer> {
    const reader = new StreamReader();
    src.pipe(reader);
    return new Promise((resolve, reject) => {
        reader.on("error", reject);
        reader.on("close", () => {
            resolve(Buffer.concat(reader.result as Buffer[]));
        });
    });
}
