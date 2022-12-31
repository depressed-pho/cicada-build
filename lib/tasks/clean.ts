import { rm } from "node:fs/promises";

export async function distclean() {
    await rm("dist", {force: true, recursive: true});
}

export async function clean() {
    await rm("dist/build", {force: true, recursive: true});
    await rm("dist/generated", {force: true, recursive: true});
}
