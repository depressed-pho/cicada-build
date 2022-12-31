import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/* This is damn so unholy. Does not work if the module is an ESM. */
export function requireUncached(mod: string): any {
    delete require.cache[require.resolve(mod)];
    return require(mod);
}
