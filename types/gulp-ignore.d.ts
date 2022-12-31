import { Transform } from "node:stream";
import gulpMatch = require("gulp-match");
import minimatch = require("minimatch");

export function include(condition: gulpMatch.MatchCondition,
                        options?: minimatch.IOptions): Transform;

export function exclude(condition: gulpMatch.MatchCondition,
                        options?: minimatch.IOptions): Transform;

export default include;
