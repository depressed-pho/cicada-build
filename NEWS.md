# Release notes

## 1.3.0 -- 2025-06-19

* ``packs[*].name`` can now have substitution strings:
  * ``${name}`` is substituted with the common pack name.
  * ``${version}`` is substituted with the common pack version.
* Updated dependencies for TypeScript 5.8.

## 1.2.3 -- 2024-06-21

* ``patch-package`` is now excluded from vendoring even if it is declared
  as a runtime dependency.
* Compatibility with Node 22: Import assetions is no longer supported. Use
  import attributes instead.

## 1.2.2 -- 2024-01-22

* TypeScript and JavaScript modules can now import `package.json` by doing
  `import pkg from "package.json"`.

## 1.2.1 -- 2024-01-17

* `cicada-build` now supports TypeScript 5.

## 1.2.0 -- 2023-09-17

* `version` fields in `src/manifest.js` can now be set to a string
  `"self"`, which will be substituted with the version number found in
  `package.json`.
* Fixed a bug where dependency arrays in `src/manifest.js` weren't handled
  correctly.
* Fixed a bug where commented "import" statements in scripts were
  erroneously attempted to be rewritten.
* Fixed a bug where `tsc` cannot find files generated by `protoc` when the
  addon has both a behaviour pack and a resource pack.

## 1.1.0 -- 2023-01-04

* Renamed the package from `@depressed-pho/cicada-build` to
  `cicada-build`. Since it's not meant to be published on the public NPM
  repository, it doesn't make sense to have a scope.
* Relative imports in TypeScript modules now require extensions.

## 1.0.0 -- 2023-01-01

* Initial release.
