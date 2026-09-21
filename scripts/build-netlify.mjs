import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE } from "../worker/page.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, "netlify-dist");
const functionOutput = resolve(root, "netlify", "functions-build");
const migrationImageDirectory = resolve(root, "migration", "uploads", "dishes");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, "public"), output, { recursive: true });
await writeFile(resolve(output, "index.html"), PAGE, "utf8");

let migrationImageNames = [];
try {
  migrationImageNames = (await readdir(migrationImageDirectory)).filter((name) => /\.(?:jpg|jpeg|png|webp|gif)$/i.test(name));
  await mkdir(resolve(output, "assets", "migrated"), { recursive: true });
  for (const name of migrationImageNames) {
    await cp(resolve(migrationImageDirectory, name), resolve(output, "assets", "migrated", name));
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
await writeFile(resolve(root, "netlify", "functions", "migration-manifest.mjs"), `export const MIGRATED_IMAGE_KEYS = ${JSON.stringify(migrationImageNames.map((name) => `dishes/${name}`))};\n`);

await rm(functionOutput, { recursive: true, force: true });
await mkdir(functionOutput, { recursive: true });
await cp(resolve(root, "netlify", "functions", "migration-manifest.mjs"), resolve(functionOutput, "migration-manifest.mjs"));
if (migrationImageNames.length) {
  await mkdir(resolve(functionOutput, "images"), { recursive: true });
  for (const name of migrationImageNames) {
    await cp(resolve(migrationImageDirectory, name), resolve(functionOutput, "images", name));
  }
}
await cp(resolve(root, "netlify", "functions", "api.mjs"), resolve(functionOutput, "api.mjs"));

console.log(`Built Netlify static site and bundled gateway (${migrationImageNames.length} migrated images)`);
