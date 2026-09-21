import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, "netlify-dist");

for (const file of ["index.html", "app.js", "assets/braised-pork.png", "assets/kung-pao-chicken.png", "assets/steamed-bass.png"]) {
  await access(resolve(output, file));
}

const html = await readFile(resolve(output, "index.html"), "utf8");
assert.match(html, /云巷小馆/);
assert.match(html, /id="adminLoginForm"/);
assert.match(html, /src="\/app\.js"/);

const app = await readFile(resolve(output, "app.js"), "utf8");
assert.match(app, /\/api\/orders/);
assert.match(app, /\/api\/admin\/uploads/);

const functionSource = await readFile(resolve(root, "netlify", "functions", "api.mjs"), "utf8");
assert.match(functionSource, /"\/api\/\*"/);
assert.match(functionSource, /"\/uploads\/\*"/);

console.log("Netlify build validation passed");
