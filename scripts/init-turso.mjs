import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) throw new Error("请先设置 TURSO_DATABASE_URL");

const client = createClient({ url, authToken });
const sql = await readFile(resolve(root, "drizzle", "0000_menu.sql"), "utf8");
const statements = sql
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean)
  .filter((statement) => !/^PRAGMA\s+optimize$/i.test(statement));

for (const statement of statements) {
  await client.execute(statement);
}

console.log("Turso database schema is ready");
