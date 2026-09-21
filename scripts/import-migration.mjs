import { getStore } from "@netlify/blobs";
import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const required = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "NETLIFY_SITE_ID", "NETLIFY_AUTH_TOKEN"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`请先设置 ${name}`);
}

const data = JSON.parse(await readFile(resolve(root, "migration", "sites-export.json"), "utf8"));
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const store = getStore({ name: "dish-images", siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });

const statements = [];
for (const row of data.categories) {
  statements.push({
    sql: "INSERT OR REPLACE INTO categories (id, name, sort_order, active, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [row.id, row.name, row.sort_order, row.active, row.created_at],
  });
}
for (const row of data.dishes) {
  statements.push({
    sql: "INSERT OR REPLACE INTO dishes (id, category_id, name, description, price_cents, image_url, is_available, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [row.id, row.category_id, row.name, row.description, row.price_cents, row.image_url, row.is_available, row.sort_order, row.created_at, row.updated_at],
  });
}
for (const row of data.orders) {
  statements.push({
    sql: "INSERT OR REPLACE INTO orders (id, order_no, customer_name, phone, table_no, note, total_cents, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [row.id, row.order_no, row.customer_name, row.phone, row.table_no, row.note, row.total_cents, row.status, row.created_at, row.updated_at],
  });
}
for (const row of data.orderItems) {
  statements.push({
    sql: "INSERT OR REPLACE INTO order_items (id, order_id, dish_id, dish_name, unit_price_cents, quantity) VALUES (?, ?, ?, ?, ?, ?)",
    args: [row.id, row.order_id, row.dish_id, row.dish_name, row.unit_price_cents, row.quantity],
  });
}

if (statements.length) await client.batch(statements, "write");

const imagePaths = [...new Set(data.dishes.map((dish) => dish.image_url).filter((url) => url?.startsWith("/uploads/")))];
const contentTypes = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
for (const path of imagePaths) {
  const key = path.slice("/uploads/".length);
  const file = await readFile(resolve(root, "migration", path.replace(/^\/+/, "")));
  await store.set(key, file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), {
    metadata: { contentType: contentTypes[extname(path).toLowerCase()] || "application/octet-stream", originalName: "migrated" },
  });
  console.log(`Uploaded ${path}`);
}

client.close();
console.log(`Imported ${data.categories.length} categories, ${data.dishes.length} dishes, ${data.orders.length} orders and ${imagePaths.length} images`);
