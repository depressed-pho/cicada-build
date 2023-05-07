# Release notes

## 1.2.0 -- not released yet

* `version` fields in `src/manifest.js` can now be set to a string
  `"self"`, which will be substituted with the version number found in
  `package.json`.
* Fixed a bug where dependency arrays in `src/manifest.js` weren't handled
  correctly.
* Fixed a bug where commented "import" statements in scripts were
  erroneously attempted to be rewritten.

## 1.1.0 -- 2023-01-04

* Renamed the package from `@depressed-pho/cicada-build` to
  `cicada-build`. Since it's not meant to be published on the public NPM
  repository, it doesn't make sense to have a scope.
* Relative imports in TypeScript modules now require extensions.

## 1.0.0 -- 2023-01-01

* Initial release.
