#!/usr/bin/env node
/*
 * Gulp does not have a public API for programmatical invocation so we
 * manipulate process.argv and run gulp-cli.
 */
const process = require("node:process");

process.argv.push(
    "--gulpfile", require.resolve("../dist/index.js"),
    "--cwd", process.cwd()
);

// NOTE: This is technically not a public API. We *must not* load
// "gulp-cli" before manipulating process.argv.
require("gulp-cli")();
