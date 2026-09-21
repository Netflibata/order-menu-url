import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../worker/index.js";
import { createTursoD1 } from "../netlify/functions/_lib/turso-d1.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporaryDirectory = await mkdtemp(join(tmpdir(), "yunxiang-netlify-"));
const databasePath = join(temporaryDirectory, "menu.db").replaceAll("\\", "/");
const database = createTursoD1({ url: `file:${databasePath}` });
const storedImages = new Map();
const bucket = {
  async put(key, value, options) {
    storedImages.set(key, { value, contentType: options.httpMetadata.contentType });
  },
  async get(key) {
    const item = storedImages.get(key);
    if (!item) return null;
    return {
      body: item.value,
      httpEtag: '"smoke-test"',
      writeHttpMetadata(headers) { headers.set("content-type", item.contentType); },
    };
  },
  async delete(key) { storedImages.delete(key); },
};

const env = {
  DB: database,
  BUCKET: bucket,
  ADMIN_PASSWORD: "smoke-test-password",
  SESSION_SECRET: "smoke-test-session-secret",
  MAX_UPLOAD_BYTES: 4 * 1024 * 1024,
};

async function call(path, options = {}) {
  const response = await worker.fetch(new Request(`https://test.example${path}`, options), env, {});
  const data = await response.json();
  return { response, data };
}

try {
  const schema = await readFile(resolve(root, "drizzle", "0000_menu.sql"), "utf8");
  for (const statement of schema.split(";").map((item) => item.trim()).filter(Boolean)) {
    await database.client.execute(statement);
  }

  const menu = await call("/api/menu");
  assert.equal(menu.response.status, 200);
  assert.equal(menu.data.dishes.length, 8);

  const created = await call("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ customerName: "迁移测试", tableNo: "A01", items: [{ id: menu.data.dishes[0].id, quantity: 2 }] }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.order.status, "pending");

  const orderNo = encodeURIComponent(created.data.order.orderNo);
  const fetched = await call(`/api/orders/${orderNo}`);
  assert.equal(fetched.data.order.items[0].quantity, 2);

  const refunded = await call(`/api/orders/${orderNo}/refund`, { method: "POST" });
  assert.equal(refunded.data.order.status, "refunded");

  const login = await call("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "smoke-test-password" }),
  });
  assert.equal(login.response.status, 200);
  const cookie = login.response.headers.get("set-cookie").split(";")[0];

  const adminOrders = await call("/api/admin/orders", { headers: { cookie } });
  assert.equal(adminOrders.response.status, 200);
  assert.equal(adminOrders.data.orders[0].status, "refunded");

  const form = new FormData();
  form.append("file", new File([new Uint8Array([137, 80, 78, 71])], "dish.png", { type: "image/png" }));
  const uploaded = await call("/api/admin/uploads", { method: "POST", headers: { cookie }, body: form });
  assert.equal(uploaded.response.status, 201);

  const image = await worker.fetch(new Request(`https://test.example${uploaded.data.url}`), env, {});
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");

  console.log("Netlify migration smoke checks passed");
} finally {
  database.client.close();
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
