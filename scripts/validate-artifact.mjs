import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workerPath = resolve("dist/server/index.js");
const manifestPath = resolve("dist/.openai/hosting.json");
JSON.parse(await readFile(manifestPath, "utf8"));
const workerModule = await import(pathToFileURL(workerPath));
assert.equal(typeof workerModule.default?.fetch, "function", "Worker must export default.fetch");
console.log("Artifact is valid ESM and exports default.fetch");

