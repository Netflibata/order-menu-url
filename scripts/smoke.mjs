import assert from "node:assert/strict";
import worker from "../worker/index.js";

async function call(path, options = {}, env = {}) {
  const response = await worker.fetch(new Request("http://local.test" + path, options), env, {});
  const data = await response.json();
  return { response, data };
}

const menu = await call("/api/menu");
assert.equal(menu.response.status, 200);
assert.ok(menu.data.dishes.length >= 3);

const created = await call("/api/orders", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ customerName: "测试顾客", tableNo: "A01", items: [{ id: menu.data.dishes[0].id, quantity: 2 }] }),
});
assert.equal(created.response.status, 201);
assert.equal(created.data.order.status, "pending");

const orderNo = encodeURIComponent(created.data.order.orderNo);
const fetched = await call("/api/orders/" + orderNo);
assert.equal(fetched.data.order.items[0].quantity, 2);

const refunded = await call("/api/orders/" + orderNo + "/refund", { method: "POST", body: "{}" });
assert.equal(refunded.data.order.status, "refunded");

const testObjects = new Map();
const testAdminEnv = {
  ADMIN_PASSWORD: "test-admin-password",
  SESSION_SECRET: "test-session-secret",
  BUCKET: {
    async put(key, body, options) { testObjects.set(key, { body: new Uint8Array(body), type: options.httpMetadata.contentType }); },
    async get(key) { const value = testObjects.get(key); return value ? { body: value.body, httpEtag: '"test"', writeHttpMetadata(headers) { headers.set("content-type", value.type); } } : null; },
    async delete(key) { testObjects.delete(key); },
  },
};
const login = await call("/api/admin/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password: "test-admin-password" }),
}, testAdminEnv);
assert.equal(login.response.status, 200);
const cookie = login.response.headers.get("set-cookie").split(";")[0];

const adminOrders = await call("/api/admin/orders", { headers: { cookie } }, testAdminEnv);
assert.equal(adminOrders.response.status, 200);
assert.equal(adminOrders.data.orders[0].status, "refunded");

const imageForm = new FormData();
imageForm.append("file", new File([new Uint8Array([137, 80, 78, 71])], "dish.png", { type: "image/png" }));
const uploaded = await call("/api/admin/uploads", { method: "POST", headers: { cookie }, body: imageForm }, testAdminEnv);
assert.equal(uploaded.response.status, 201);
assert.match(uploaded.data.url, /^\/uploads\/dishes\//);

const imageResponse = await worker.fetch(new Request("http://local.test" + uploaded.data.url), testAdminEnv, {});
assert.equal(imageResponse.status, 200);
assert.equal(imageResponse.headers.get("content-type"), "image/png");

console.log("Smoke checks passed: menu, checkout, refund, admin access, image upload and retrieval");
