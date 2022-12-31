import Vinyl = require("vinyl");
import minimatch = require("minimatch");

declare function gulpMatch(file: Vinyl,
                           condition: gulpMatch.MatchCondition,
                           options?: minimatch.IOptions): boolean;

declare namespace gulpMatch {
    export type MatchCondition =
        boolean | ((file: Vinyl) => boolean) | RegExp | string | string[] |
        {isFile: boolean} | {isDirectory: boolean} |
        any; // Yes, and then finally "any". Now type safety is totally
             // thrown away.
}

export = gulpMatch;
