import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "server"), { recursive: true });
await mkdir(resolve(dist, "client"), { recursive: true });
await mkdir(resolve(dist, ".openai", "drizzle"), { recursive: true });
await cp(resolve(root, "worker"), resolve(dist, "server"), { recursive: true });
await cp(resolve(root, "public"), resolve(dist, "client"), { recursive: true });
await cp(resolve(root, ".openai", "hosting.json"), resolve(dist, ".openai", "hosting.json"));
await cp(resolve(root, "drizzle"), resolve(dist, ".openai", "drizzle"), { recursive: true });

const manifest = JSON.parse(await readFile(resolve(dist, ".openai", "hosting.json"), "utf8"));
await writeFile(resolve(dist, ".openai", "hosting.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Built dist/server and dist/client");
