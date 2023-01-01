# Basics

First, your addon must have an [NPM](https://www.npmjs.com/)
`package.json`. Run `npm init` if it doesn't already have one. The addon
does not need to be published to the NPM repository, but it still has to be
an NPM package:

```shell
% npm init
```

Then install `cicada-build` as a development dependency:

```shell
% npm i -D github:depressed-pho/cicada-build
```

Now setup some package scripts. This isn't mandatory but is for your
convenience. Your `package.json` should look like this:

```json
{
  "name": "foo",
  "version": "1.0.0",
  "description": "Adds something cool to the world",
  "scripts": {
    "build": "cicada-build",
    "clean": "cicada-build clean",
    "distclean": "cicada-build distclean",
    "install-addon": "cicada-build install",
    "watch": "cicada-build watch"
  },
  ...
}
```

## Required files

There is only a single file that is required for all addons, the manifest
file. Create `src/manifest.js` with the following structure:

```javascript
/* This file provides additional metadata for generating manifest.json,
 * .mcpack, and .mcaddon files. The other data are read from
 * package.json. It's a JS file so it can have comments.
 */
module.exports = {
    // Common properties shared by every pack (optional).
    common: {
        // Override package.json "name" (optional).
        name: "Foo",

        // Generate or copy a pack icon from a file relative to manifest.js
        // (optional). The file will be copied if it's a PNG file of at
        // most 256x256 pixels, or converted otherwise. The image has to be
        // square: its width and height must be the same.
        icon: "pack_icon.svg",

        // Required
        min_engine_version: "1.19.51"
    },
    // Packs to generate (required).
    packs: [
        {
            // This is a behavior pack because it has a script module.

            // Optional
            name: "Foo (behavior)",

            // Required: pack UUID
            uuid: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxxx",

            // Required
            modules: [
                // "version" can be ommitted.
                {
                    description: "Foo: scripts",
                    type: "script",
                    language: "javascript",
                    uuid: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxxx",
                    entry: "scripts/server/index.js",
                    // Specify which scripts belong to this module. It must
                    // obviously contain the entry point.
                    include: ["scripts/**"]
                },
                {
                    description: "Foo: server data files",
                    type: "data",
                    uuid: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxxx",
                    // Specify which files belong to this module.
                    include: ["items/**"]
                }
            ],

            // Optional
            dependencies: {
                "@minecraft/server": "1.1.0-beta",
                "@minecraft/server-ui": "1.0.0-beta"
            },

            // Optional
            capabilities: ["script_eval"]
        }
    ]
};
```

The schema for this file is at
[../lib/manifest.schema.json](../lib/manifest.schema.json). While this file
is similar to `manifest.json`, there is a crucial difference. Remember that
addons may contain two or more packs, i.e. a single `*.mcaddon` may have
both a behavior pack and a resource pack. `manifest.js` is for the entire
addon and `cicada-build` generates `manifest.json` for each of the pack.

## Building

Run `npm run build` to build your addon. If everything goes well, one of
`*.mcaddon`, `*.mctemplate`, or `*.mcpack` will be created under the directory `dist`.

## Installing

If you can somehow mount the `com.mojang` directory on your computer,
create a file named `.env` under the root of your addon directory, i.e. the
same directory where your `package.json` resides. Its content should look
like this:

```text
MC_COM_MOJANG_PATH="/path/to/your/com.mojang"
```

Now running the `install-addon` script builds the addon and installs it as
a development pack. Restart Minecraft and it will show up as an available
addon:

```shell
% npm run install-addon
```

## Watching changes

Running the `watch` script watches changes to input files, and when any
file is modified `cicada-build` will rebuild the addon and possibly
install it. Note that worlds with the addon applied need to be reloaded
for the change to take effect.

# Icon resizing and format conversion

The pack icon file, declared in `manifest.js`, is a source of
`pack_icon.png`. If the image is not square `cicada-build` will abort with
an error. If it's larger than 256x256 it will be resized. If it's not a PNG
image it will be converted. Note that resizing and format conversion
require [GraphicsMagick](http://www.graphicsmagick.org/) to be installed on
your system.

# TypeScript integration

Script modules may contain not only JavaScript `.js` files but also
[TypeScript](https://www.typescriptlang.org/) `.ts` files. `cicada-build`
will automatically transpile `.ts` into `.js` with sensible compiler
options suitable for the scripting API but you can also create
[src/tsconfig.json](https://www.typescriptlang.org/tsconfig/) to further
modify the behavior of the transpiler.

Note that `import` statements should not have extensions. `cicada-build`
will automatically append extensions after the transpilation:

```typescript
import { Foo } from "./foo"; // Good
//import { Foo } from "./foo.js"; // Bad. Don't do this.
```

# NPM integration

Script modules may use [NPM](https://www.npmjs.com/) packages. Any packages
listed in `dependencies` in your `package.json` will be copied to your
script modules:

```shell
% npm i foobar
```

Then you can use them in your script:

```typescript
import { Foobar } from "foobar";
```

Note that only ECMAScript modules are supported at the moment. Bundling
CommonJS modules is not possible.

# Protocol Buffers integration

Script modules may contain [Protocol
Buffers](https://developers.google.com/protocol-buffers) `.proto`
files. They are automatically compiled to `.js` and `.d.ts` (for
TypeScript) and you can import them in your script:

```protobuf
// foo.proto
syntax = "proto3";

message Foo {
    bool bar = 1;
}
```

```typescript
import { Foo } from "./foo_pb"; // You need a suffix "_pb" to import them.
```

Note that you need to install the `protoc` program on your system to
compile `.proto` files. Also
[@protobuf-ts/runtime](https://github.com/timostamm/protobuf-ts/tree/master/packages/runtime)
needs to be bundled:

```shell
% npm i @protobuf-ts/runtime
```
