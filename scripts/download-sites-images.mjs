import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetch, ProxyAgent } from "undici";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceOrigin = process.env.SOURCE_SITE_ORIGIN || "https://yunxiang-menu.dynv6.net";
const exportFile = resolve(root, "migration", "sites-export.json");
const data = JSON.parse(await readFile(exportFile, "utf8"));
const paths = [...new Set(data.dishes.map((dish) => dish.image_url).filter((url) => url?.startsWith("/uploads/")))];
const dispatcher = process.env.SOURCE_PROXY ? new ProxyAgent(process.env.SOURCE_PROXY) : undefined;

for (const path of paths) {
  const response = await fetch(new URL(path, sourceOrigin), { dispatcher, headers: { "user-agent": "YunxiangMenuMigration/1.0" } });
  if (!response.ok) throw new Error(`下载失败 ${response.status}: ${path}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) throw new Error(`返回内容不是图片: ${path}`);
  const destination = resolve(root, "migration", path.replace(/^\/+/, ""));
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  console.log(`Downloaded ${path}`);
}

await dispatcher?.close();
console.log(`Downloaded ${paths.length} uploaded dish images`);
