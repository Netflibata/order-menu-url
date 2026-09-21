import { PAGE } from "./page.js";

const DEFAULT_CATEGORIES = [
  { id: "cat-signature", name: "招牌热菜", sortOrder: 10, active: true },
  { id: "cat-seasonal", name: "时令鲜味", sortOrder: 20, active: true },
  { id: "cat-vegetable", name: "清爽时蔬", sortOrder: 30, active: true },
  { id: "cat-staple", name: "主食甜点", sortOrder: 40, active: true },
];

const DEFAULT_DISHES = [
  { id: "dish-kungpao", categoryId: "cat-signature", name: "宫保鸡丁", description: "鸡丁嫩滑，花生酥香，荔枝口微辣。", priceCents: 3800, imageUrl: "/assets/kung-pao-chicken.png", available: true, sortOrder: 10 },
  { id: "dish-pork", categoryId: "cat-signature", name: "云巷红烧肉", description: "慢火收汁，酱香浓郁，肥而不腻。", priceCents: 5200, imageUrl: "/assets/braised-pork.png", available: true, sortOrder: 20 },
  { id: "dish-tofu", categoryId: "cat-signature", name: "麻婆豆腐", description: "牛肉碎增香，麻、辣、烫、嫩。", priceCents: 2600, imageUrl: "/assets/kung-pao-chicken.png", available: true, sortOrder: 30 },
  { id: "dish-fish", categoryId: "cat-seasonal", name: "清蒸鲈鱼", description: "姜葱豉油提鲜，保留鱼肉本味。", priceCents: 7800, imageUrl: "/assets/steamed-bass.png", available: true, sortOrder: 10 },
  { id: "dish-shrimp", categoryId: "cat-seasonal", name: "龙井虾仁", description: "河虾仁清甜，淡淡茶香。", priceCents: 6800, imageUrl: "/assets/steamed-bass.png", available: true, sortOrder: 20 },
  { id: "dish-greens", categoryId: "cat-vegetable", name: "蒜蓉时蔬", description: "当日绿叶菜，旺火快炒，清脆爽口。", priceCents: 2200, imageUrl: "/assets/kung-pao-chicken.png", available: true, sortOrder: 10 },
  { id: "dish-rice", categoryId: "cat-staple", name: "腊味煲仔饭", description: "丝苗米焦香，腊味咸香入味。", priceCents: 3200, imageUrl: "/assets/braised-pork.png", available: true, sortOrder: 10 },
  { id: "dish-sweet", categoryId: "cat-staple", name: "桂花酒酿圆子", description: "软糯小圆子，淡淡桂花香。", priceCents: 1800, imageUrl: "/assets/braised-pork.png", available: true, sortOrder: 20 },
];

const memory = { categories: DEFAULT_CATEGORIES.map((item) => ({ ...item })), dishes: DEFAULT_DISHES.map((item) => ({ ...item })), orders: [] };

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers } });
}
function cleanText(value, max = 120) { return String(value ?? "").trim().slice(0, max); }
function parseCookies(request) {
  const values = {};
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) values[key] = rest.join("=");
  }
  return values;
}
async function hmac(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}
async function isAdmin(request, env) {
  const token = parseCookies(request).menu_admin;
  if (!token) return false;
  const expected = await hmac(env.SESSION_SECRET || "local-preview-secret", "yunxiang-admin-v1");
  return safeEqual(token, expected);
}
async function requireAdmin(request, env) { return (await isAdmin(request, env)) ? null : json({ error: "请先登录后台" }, 401); }
async function bodyJson(request) {
  try { return await request.json(); } catch { throw new Error("提交内容格式不正确"); }
}

async function ensureSeed(db) {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM categories").first();
  if (Number(row?.count || 0) > 0) return;
  const statements = [];
  for (const item of DEFAULT_CATEGORIES) statements.push(db.prepare("INSERT OR IGNORE INTO categories (id, name, sort_order, active) VALUES (?, ?, ?, ?)").bind(item.id, item.name, item.sortOrder, item.active ? 1 : 0));
  for (const item of DEFAULT_DISHES) statements.push(db.prepare("INSERT OR IGNORE INTO dishes (id, category_id, name, description, price_cents, image_url, is_available, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(item.id, item.categoryId, item.name, item.description, item.priceCents, item.imageUrl, item.available ? 1 : 0, item.sortOrder));
  await db.batch(statements);
}

async function menuData(env, includeUnavailable = false) {
  if (!env.DB) return { categories: memory.categories.filter((item) => item.active), dishes: memory.dishes.filter((item) => includeUnavailable || item.available) };
  await ensureSeed(env.DB);
  const [categoryResult, dishResult] = await Promise.all([
    env.DB.prepare("SELECT id, name, sort_order, active FROM categories ORDER BY sort_order, name").all(),
    env.DB.prepare(`SELECT id, category_id, name, description, price_cents, image_url, is_available, sort_order FROM dishes ${includeUnavailable ? "" : "WHERE is_available = 1"} ORDER BY sort_order, name`).all(),
  ]);
  return {
    categories: categoryResult.results.map((row) => ({ id: row.id, name: row.name, sortOrder: row.sort_order, active: Boolean(row.active) })),
    dishes: dishResult.results.map((row) => ({ id: row.id, categoryId: row.category_id, name: row.name, description: row.description, priceCents: row.price_cents, imageUrl: row.image_url, available: Boolean(row.is_available), sortOrder: row.sort_order })),
  };
}

function publicOrder(order) {
  return { id: order.id, orderNo: order.orderNo, customerName: order.customerName, tableNo: order.tableNo, note: order.note, totalCents: order.totalCents, status: order.status, createdAt: order.createdAt, items: order.items };
}

async function createOrder(request, env) {
  const data = await bodyJson(request);
  const customerName = cleanText(data.customerName, 30);
  const phone = cleanText(data.phone, 20);
  const tableNo = cleanText(data.tableNo, 20);
  const note = cleanText(data.note, 120);
  const requested = Array.isArray(data.items) ? data.items.slice(0, 30) : [];
  if (!customerName) return json({ error: "请填写称呼" }, 400);
  if (!requested.length) return json({ error: "请先选择菜品" }, 400);
  const quantityById = new Map();
  for (const item of requested) {
    const id = cleanText(item.id, 80);
    const quantity = Number(item.quantity);
    if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return json({ error: "菜品数量不正确" }, 400);
    quantityById.set(id, (quantityById.get(id) || 0) + quantity);
  }
  const ids = [...quantityById.keys()];
  let dishes;
  if (!env.DB) dishes = memory.dishes.filter((dish) => ids.includes(dish.id) && dish.available);
  else {
    await ensureSeed(env.DB);
    const placeholders = ids.map(() => "?").join(",");
    const result = await env.DB.prepare(`SELECT id, name, price_cents, is_available FROM dishes WHERE id IN (${placeholders})`).bind(...ids).all();
    dishes = result.results.filter((dish) => Boolean(dish.is_available)).map((dish) => ({ id: dish.id, name: dish.name, priceCents: dish.price_cents }));
  }
  if (dishes.length !== ids.length) return json({ error: "部分菜品已下架，请刷新菜单后重试" }, 409);
  const items = dishes.map((dish) => ({ id: crypto.randomUUID(), dishId: dish.id, dishName: dish.name, unitPriceCents: dish.priceCents, quantity: quantityById.get(dish.id) }));
  const totalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const orderNo = "YX-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomUUID().slice(0, 6).toUpperCase();
  const order = { id, orderNo, customerName, phone, tableNo, note, totalCents, status: "pending", createdAt: now, updatedAt: now, items };
  if (!env.DB) memory.orders.unshift(order);
  else {
    const statements = [env.DB.prepare("INSERT INTO orders (id, order_no, customer_name, phone, table_no, note, total_cents, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)").bind(id, orderNo, customerName, phone, tableNo, note, totalCents, now, now)];
    for (const item of items) statements.push(env.DB.prepare("INSERT INTO order_items (id, order_id, dish_id, dish_name, unit_price_cents, quantity) VALUES (?, ?, ?, ?, ?, ?)").bind(item.id, id, item.dishId, item.dishName, item.unitPriceCents, item.quantity));
    await env.DB.batch(statements);
  }
  return json({ order: publicOrder(order) }, 201);
}

async function findOrder(env, orderNo) {
  if (!env.DB) return memory.orders.find((order) => order.orderNo === orderNo) || null;
  const rows = await env.DB.prepare(`SELECT o.id, o.order_no, o.customer_name, o.phone, o.table_no, o.note, o.total_cents, o.status, o.created_at, o.updated_at, oi.id AS item_id, oi.dish_id, oi.dish_name, oi.unit_price_cents, oi.quantity FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id WHERE o.order_no = ? ORDER BY oi.rowid`).bind(orderNo).all();
  if (!rows.results.length) return null;
  const first = rows.results[0];
  return { id: first.id, orderNo: first.order_no, customerName: first.customer_name, phone: first.phone, tableNo: first.table_no, note: first.note, totalCents: first.total_cents, status: first.status, createdAt: first.created_at, updatedAt: first.updated_at, items: rows.results.filter((row) => row.item_id).map((row) => ({ id: row.item_id, dishId: row.dish_id, dishName: row.dish_name, unitPriceCents: row.unit_price_cents, quantity: row.quantity })) };
}

async function refundOrder(env, orderNo) {
  const order = await findOrder(env, orderNo);
  if (!order) return json({ error: "没有找到这个订单" }, 404);
  if (order.status !== "pending") return json({ error: order.status === "refunded" ? "订单已退款" : "订单已开始制作，请联系商家处理" }, 409);
  const now = new Date().toISOString();
  if (!env.DB) { order.status = "refunded"; order.updatedAt = now; }
  else { await env.DB.prepare("UPDATE orders SET status = 'refunded', updated_at = ? WHERE id = ? AND status = 'pending'").bind(now, order.id).run(); order.status = "refunded"; order.updatedAt = now; }
  return json({ order: publicOrder(order), message: "退款申请已完成" });
}

async function allOrders(env) {
  if (!env.DB) return memory.orders.map((order) => ({ ...order, items: order.items.map((item) => ({ ...item })) }));
  const result = await env.DB.prepare(`SELECT o.id, o.order_no, o.customer_name, o.phone, o.table_no, o.note, o.total_cents, o.status, o.created_at, o.updated_at, oi.id AS item_id, oi.dish_id, oi.dish_name, oi.unit_price_cents, oi.quantity FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id ORDER BY o.created_at DESC, oi.rowid LIMIT 500`).all();
  const orders = new Map();
  for (const row of result.results) {
    if (!orders.has(row.id)) orders.set(row.id, { id: row.id, orderNo: row.order_no, customerName: row.customer_name, phone: row.phone, tableNo: row.table_no, note: row.note, totalCents: row.total_cents, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, items: [] });
    if (row.item_id) orders.get(row.id).items.push({ id: row.item_id, dishId: row.dish_id, dishName: row.dish_name, unitPriceCents: row.unit_price_cents, quantity: row.quantity });
  }
  return [...orders.values()];
}

async function updateOrderStatus(request, env, id) {
  const data = await bodyJson(request);
  const allowed = ["pending", "preparing", "completed", "refunded"];
  if (!allowed.includes(data.status)) return json({ error: "订单状态不正确" }, 400);
  const now = new Date().toISOString();
  if (!env.DB) {
    const order = memory.orders.find((item) => item.id === id);
    if (!order) return json({ error: "订单不存在" }, 404);
    order.status = data.status; order.updatedAt = now;
  } else {
    const result = await env.DB.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").bind(data.status, now, id).run();
    if (!result.meta.changes) return json({ error: "订单不存在" }, 404);
  }
  return json({ ok: true });
}

async function deleteOrder(env, id) {
  if (!env.DB) {
    const exists = memory.orders.some((item) => item.id === id);
    if (!exists) return json({ error: "订单不存在" }, 404);
    memory.orders = memory.orders.filter((item) => item.id !== id);
  } else {
    const current = await env.DB.prepare("SELECT id FROM orders WHERE id = ?").bind(id).first();
    if (!current) return json({ error: "订单不存在" }, 404);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM order_items WHERE order_id = ?").bind(id),
      env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(id),
    ]);
  }
  return json({ ok: true });
}

function validOrderDate(value) {
  const date = cleanText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : "";
}

function orderIsOnChinaDate(order, date) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(order.createdAt));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}` === date;
  } catch { return false; }
}

async function deleteOrdersByDate(request, env) {
  const data = await bodyJson(request);
  const date = validOrderDate(data.date);
  if (!date) return json({ error: "请选择有效的删除日期" }, 400);
  const expectedHash = String(env.ORDER_DELETE_PASSWORD_HASH || "");
  const passwordPepper = String(env.ORDER_DELETE_PASSWORD_PEPPER || "");
  if (!expectedHash || !passwordPepper) return json({ error: "批量删除密码尚未配置" }, 503);
  const submittedHash = await hmac(passwordPepper, String(data.password || ""));
  if (!safeEqual(submittedHash, expectedHash)) return json({ error: "二次确认密码不正确" }, 403);

  let deletedCount = 0;
  if (!env.DB) {
    const before = memory.orders.length;
    memory.orders = memory.orders.filter((order) => !orderIsOnChinaDate(order, date));
    deletedCount = before - memory.orders.length;
  } else {
    const filter = "date(created_at, '+8 hours') = ?";
    const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM orders WHERE ${filter}`).bind(date).first();
    deletedCount = Number(count?.count || 0);
    if (deletedCount) await env.DB.batch([
      env.DB.prepare(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE ${filter})`).bind(date),
      env.DB.prepare(`DELETE FROM orders WHERE ${filter}`).bind(date),
    ]);
  }
  return json({ ok: true, date, deletedCount });
}

async function createCategory(request, env) {
  const data = await bodyJson(request); const name = cleanText(data.name, 30);
  if (!name) return json({ error: "请填写分类名称" }, 400);
  const category = { id: crypto.randomUUID(), name, sortOrder: Number(data.sortOrder) || 100, active: data.active !== false };
  if (!env.DB) memory.categories.push(category); else await env.DB.prepare("INSERT INTO categories (id, name, sort_order, active) VALUES (?, ?, ?, ?)").bind(category.id, category.name, category.sortOrder, category.active ? 1 : 0).run();
  return json({ category }, 201);
}
async function updateCategory(request, env, id) {
  const data = await bodyJson(request); const name = cleanText(data.name, 30); const sortOrder = Number(data.sortOrder) || 100; const active = data.active !== false;
  if (!name) return json({ error: "请填写分类名称" }, 400);
  if (!env.DB) { const category = memory.categories.find((item) => item.id === id); if (!category) return json({ error: "分类不存在" }, 404); Object.assign(category, { name, sortOrder, active }); }
  else { const result = await env.DB.prepare("UPDATE categories SET name = ?, sort_order = ?, active = ? WHERE id = ?").bind(name, sortOrder, active ? 1 : 0, id).run(); if (!result.meta.changes) return json({ error: "分类不存在" }, 404); }
  return json({ ok: true });
}
async function deleteCategory(env, id) {
  const menu = await menuData(env, true);
  if (menu.dishes.some((dish) => dish.categoryId === id)) return json({ error: "分类下还有菜品，请先移动或删除菜品" }, 409);
  if (!env.DB) memory.categories = memory.categories.filter((item) => item.id !== id); else await env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

function normalizeDishInput(data) {
  const name = cleanText(data.name, 40); const categoryId = cleanText(data.categoryId, 80); const description = cleanText(data.description, 160); const imageUrl = cleanText(data.imageUrl, 500); const priceCents = Math.round(Number(data.priceCents)); const sortOrder = Number(data.sortOrder) || 100; const available = data.available !== false;
  if (!name || !categoryId) throw new Error("请填写菜名并选择分类");
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 10000000) throw new Error("价格不正确");
  if (imageUrl && !imageUrl.startsWith("/") && !/^https:\/\//i.test(imageUrl)) throw new Error("图片请使用 https 地址");
  return { name, categoryId, description, imageUrl, priceCents, sortOrder, available };
}
async function createDish(request, env) {
  const dish = { id: crypto.randomUUID(), ...normalizeDishInput(await bodyJson(request)) };
  if (!env.DB) memory.dishes.push(dish); else await env.DB.prepare("INSERT INTO dishes (id, category_id, name, description, price_cents, image_url, is_available, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(dish.id, dish.categoryId, dish.name, dish.description, dish.priceCents, dish.imageUrl, dish.available ? 1 : 0, dish.sortOrder).run();
  return json({ dish }, 201);
}
async function updateDish(request, env, id) {
  const dish = normalizeDishInput(await bodyJson(request));
  let oldImageUrl = "";
  if (!env.DB) { const current = memory.dishes.find((item) => item.id === id); if (!current) return json({ error: "菜品不存在" }, 404); oldImageUrl = current.imageUrl; Object.assign(current, dish); }
  else { const current = await env.DB.prepare("SELECT image_url FROM dishes WHERE id = ?").bind(id).first(); if (!current) return json({ error: "菜品不存在" }, 404); oldImageUrl = current.image_url; await env.DB.prepare("UPDATE dishes SET category_id = ?, name = ?, description = ?, price_cents = ?, image_url = ?, is_available = ?, sort_order = ?, updated_at = ? WHERE id = ?").bind(dish.categoryId, dish.name, dish.description, dish.priceCents, dish.imageUrl, dish.available ? 1 : 0, dish.sortOrder, new Date().toISOString(), id).run(); }
  if (oldImageUrl && oldImageUrl !== dish.imageUrl) await deleteUploadedImage(env, oldImageUrl);
  return json({ ok: true });
}
async function deleteDish(env, id) {
  let imageUrl = "";
  if (!env.DB) { const current = memory.dishes.find((item) => item.id === id); imageUrl = current?.imageUrl || ""; memory.dishes = memory.dishes.filter((item) => item.id !== id); }
  else { const current = await env.DB.prepare("SELECT image_url FROM dishes WHERE id = ?").bind(id).first(); imageUrl = current?.image_url || ""; await env.DB.prepare("DELETE FROM dishes WHERE id = ?").bind(id).run(); }
  await deleteUploadedImage(env, imageUrl);
  return json({ ok: true });
}

async function deleteUploadedImage(env, imageUrl) {
  if (!env.BUCKET || !imageUrl?.startsWith("/uploads/")) return;
  try { await env.BUCKET.delete(imageUrl.slice("/uploads/".length)); }
  catch (error) { console.error("uploaded image cleanup failed", { message: error?.message }); }
}

async function uploadDishImage(request, env) {
  if (!env.BUCKET) return json({ error: "图片存储暂时不可用" }, 503);
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") return json({ error: "请选择图片文件" }, 400);
  const type = String(file.type || "").toLowerCase();
  const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  if (!extensions[type]) return json({ error: "仅支持 JPG、PNG、WebP 或 GIF 图片" }, 400);
  const maxUploadBytes = Number(env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024);
  const maxUploadMB = Math.floor(maxUploadBytes / 1024 / 1024);
  if (!file.size || file.size > maxUploadBytes) return json({ error: `图片大小不能超过 ${maxUploadMB}MB` }, 400);
  const key = `dishes/${Date.now()}-${crypto.randomUUID()}.${extensions[type]}`;
  await env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: type }, customMetadata: { originalName: cleanText(file.name, 120) } });
  return json({ url: `/uploads/${key}` }, 201);
}

async function serveUploadedImage(env, key) {
  if (!env.BUCKET) return new Response("Not found", { status: 404 });
  const object = await env.BUCKET.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({ "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" });
  object.writeHttpMetadata(headers);
  if (object.httpEtag) headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}
function pageResponse() {
  return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "permissions-policy": "camera=(), microphone=(), geolocation=()" } });
}

export default {
  async fetch(request, env, ctx) {
    void ctx; const url = new URL(request.url); const path = url.pathname;
    try {
      if (request.method === "GET" && path === "/") return pageResponse();
      const uploadAssetMatch = path.match(/^\/uploads\/(.+)$/);
      if (request.method === "GET" && uploadAssetMatch) return await serveUploadedImage(env, decodeURIComponent(uploadAssetMatch[1]));
      if (request.method === "GET" && path === "/api/menu") return json(await menuData(env));
      if (request.method === "POST" && path === "/api/orders") return await createOrder(request, env);
      const refundMatch = path.match(/^\/api\/orders\/([^/]+)\/refund$/);
      if (request.method === "POST" && refundMatch) return await refundOrder(env, decodeURIComponent(refundMatch[1]));
      const publicOrderMatch = path.match(/^\/api\/orders\/([^/]+)$/);
      if (request.method === "GET" && publicOrderMatch) { const order = await findOrder(env, decodeURIComponent(publicOrderMatch[1])); return order ? json({ order: publicOrder(order) }) : json({ error: "没有找到这个订单" }, 404); }
      if (request.method === "POST" && path === "/api/admin/login") {
        const data = await bodyJson(request); const expectedPassword = env.ADMIN_PASSWORD;
        if (!expectedPassword) return json({ error: "后台密码尚未配置" }, 503);
        if (!safeEqual(String(data.password || ""), expectedPassword)) return json({ error: "后台密码不正确" }, 401);
        const token = await hmac(env.SESSION_SECRET || "local-preview-secret", "yunxiang-admin-v1");
        const secure = url.protocol === "https:" ? "; Secure" : "";
        return json({ ok: true }, 200, { "set-cookie": `menu_admin=${token}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=86400` });
      }
      if (request.method === "POST" && path === "/api/admin/logout") return json({ ok: true }, 200, { "set-cookie": `menu_admin=; HttpOnly${url.protocol === "https:" ? "; Secure" : ""}; SameSite=Strict; Path=/; Max-Age=0` });
      if (request.method === "GET" && path === "/api/admin/status") return json({ authenticated: await isAdmin(request, env) });
      if (path.startsWith("/api/admin/")) { const denied = await requireAdmin(request, env); if (denied) return denied; }
      if (request.method === "GET" && path === "/api/admin/menu") return json(await menuData(env, true));
      if (request.method === "GET" && path === "/api/admin/orders") return json({ orders: await allOrders(env) });
      if (request.method === "POST" && path === "/api/admin/uploads") return await uploadDishImage(request, env);
      if (request.method === "POST" && path === "/api/admin/orders/delete-by-date") return await deleteOrdersByDate(request, env);
      const adminOrderMatch = path.match(/^\/api\/admin\/orders\/([^/]+)$/);
      if (request.method === "PATCH" && adminOrderMatch) return await updateOrderStatus(request, env, decodeURIComponent(adminOrderMatch[1]));
      if (request.method === "DELETE" && adminOrderMatch) return await deleteOrder(env, decodeURIComponent(adminOrderMatch[1]));
      if (request.method === "POST" && path === "/api/admin/categories") return await createCategory(request, env);
      const categoryMatch = path.match(/^\/api\/admin\/categories\/([^/]+)$/);
      if (request.method === "PATCH" && categoryMatch) return await updateCategory(request, env, decodeURIComponent(categoryMatch[1]));
      if (request.method === "DELETE" && categoryMatch) return await deleteCategory(env, decodeURIComponent(categoryMatch[1]));
      if (request.method === "POST" && path === "/api/admin/dishes") return await createDish(request, env);
      const dishMatch = path.match(/^\/api\/admin\/dishes\/([^/]+)$/);
      if (request.method === "PATCH" && dishMatch) return await updateDish(request, env, decodeURIComponent(dishMatch[1]));
      if (request.method === "DELETE" && dishMatch) return await deleteDish(env, decodeURIComponent(dishMatch[1]));
      return json({ error: "未找到页面" }, 404);
    } catch (error) {
      console.error("request failed", { path, message: error?.message });
      return json({ error: error?.message || "服务暂时不可用，请稍后重试" }, error?.message?.startsWith("请") || error?.message?.includes("不正确") ? 400 : 500);
    }
  },
};
