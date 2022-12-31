# cicada-build

`cicada-build` is an opinionated build system for Minecraft Bedrock addons
based on [Gulp](https://gulpjs.com/). Features include:

<dl>
    <dt>Better <code>manifest.json</code> handling</dt>
    <dd>
        <code>cicada-build</code> takes a <code>.js</code> file as a source of manifest and generates <code>package.json</code> by combining the source and your NPM <code>package.json</code>. If your addon consists of several packs (like a behavior pack and a resource pack), <code>cicada-build</code> will automatically generate <code>manifest.json</code> for each of your pack.
    </dd>
    <dt>Automatic icon resizing and format conversion</dt>
    <dd>
        If your pack icon is larger than 256x256 or it's not a PNG image, <code>cicada-build</code> automatically resizes it and converts to PNG.
    </dd>
    <dt>TypeScript integration</dt>
    <dd>
        <code>cicada-build</code> automatically transpiles scripts written in <a href="https://www.typescriptlang.org/">TypeScript</a> into JavaScript. It can also bundle <a href="https://www.npmjs.com/">NPM</a> packages with your script as long as they are ECMAScript modules. (Bundling CommonJS modules is not supported at the moment.)
    </dd>
    <dt>Protocol Buffers integration</dt>
    <dd>
        <code>cicada-build</code> automatically compiles <a href="https://developers.google.com/protocol-buffers">Protocol Buffers</a> <code>.proto</code> files into TypeScript so you can efficiently serialize and deserialize your data in your script.
    </dd>
    <dt>Installing addons</dt>
    <dd>
        <code>cicada-build</code> can install your addon to Minecraft as long as you can mount its <code>com.mojang</code> directory somewhere on your computer. It does **not** need to be Windows. You can still develop addons with your iOS or Android device if you can somehow mount it.
    </dd>
</dl>

## How to use

FIXME: Documentation forthcoming.

## Release notes

See [NEWS](NEWS.md).

## Author

PHO

## License

[CC0](https://creativecommons.org/share-your-work/public-domain/cc0/)
“No Rights Reserved”
