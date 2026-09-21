import { readFile } from "node:fs/promises";
import { MIGRATED_IMAGE_KEYS } from "./migration-manifest.mjs";

const SOURCE_SITE_ORIGIN = process.env.SOURCE_SITE_ORIGIN || "https://yunxiang-menu-01a0b2f3.chaijiahui0.chatgpt.site";
let menuCache = { payload: null, expiresAt: 0 };
const migratedImageSet = new Set(MIGRATED_IMAGE_KEYS);
const imageTypes = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const extensionTypes = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
let imageStorePromise;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function menuJson(data) {
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=15, stale-while-revalidate=30"
    }
  });
}

function sourceHeaders(request) {
  const headers = new Headers(request.headers);
  for (const name of ["host", "connection", "forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip", "x-nf-client-connection-ip", "cf-connecting-ip", "true-client-ip"]) headers.delete(name);
  headers.set("user-agent", "YunxiangMenuGateway/1.0");
  return headers;
}

async function sourceFetch(path, request, method = request.method, body = request.body) {
  const target = new URL(path, SOURCE_SITE_ORIGIN);
  const options = { method, headers: sourceHeaders(request), redirect: "manual" };
  if (method !== "GET" && method !== "HEAD") { options.body = body; options.duplex = "half"; }
  return fetch(target, options);
}

function uploadPath(key) {
  return `/uploads/${key.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

async function getImageStore() {
  if (!imageStorePromise) {
    imageStorePromise = import("@netlify/blobs")
      .then(({ getStore }) => getStore("dish-images", { consistency: "strong" }))
      .catch((error) => {
        imageStorePromise = undefined;
        throw error;
      });
  }
  return imageStorePromise;
}

function imageResponse(data, contentType, etag) {
  const headers = new Headers({
    "content-type": contentType || "application/octet-stream",
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff"
  });
  if (etag) headers.set("etag", etag);
  return new Response(data, { headers });
}

async function proxyToCurrentSite(request) {
  const incomingUrl = new URL(request.url);
  const upstream = await sourceFetch(incomingUrl.pathname + incomingUrl.search, request);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: upstream.headers });
}

async function proxyMenu(request) {
  if (menuCache.payload && Date.now() < menuCache.expiresAt) return menuJson(menuCache.payload);
  const upstream = await sourceFetch("/api/menu", request, "GET", null);
  if (!upstream.ok) return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: upstream.headers });
  const payload = await upstream.json();
  for (const dish of payload.dishes || []) {
    const imageUrl = String(dish.imageUrl || "");
    const match = imageUrl.match(/^\/uploads\/(dishes\/[^/?#]+)$/);
    if (match && migratedImageSet.has(match[1])) dish.imageUrl = `/assets/migrated/${match[1].slice("dishes/".length)}`;
  }
  menuCache = { payload, expiresAt: Date.now() + 15_000 };
  return menuJson(payload);
}

function isMenuMutation(request, path) {
  return ["POST", "PATCH", "DELETE"].includes(request.method)
    && /^\/api\/admin\/(?:dishes|categories)(?:\/|$)/.test(path);
}

async function serveMigratedImage(key) {
  if (!MIGRATED_IMAGE_KEYS.includes(key)) return null;
  const filename = key.slice("dishes/".length);
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  try {
    const data = await readFile(new URL(`./images/${filename}`, import.meta.url));
    return imageResponse(data, extensionTypes[extension]);
  } catch (error) {
    console.error("Migrated image read failed", { key, message: error?.message });
    return null;
  }
}

async function serveStoredImage(key) {
  const stored = await (await getImageStore()).getWithMetadata(key, { type: "arrayBuffer", consistency: "strong" });
  if (!stored) return null;
  const extension = key.slice(key.lastIndexOf(".")).toLowerCase();
  const contentType = typeof stored.metadata?.contentType === "string" ? stored.metadata.contentType : extensionTypes[extension];
  return imageResponse(stored.data, contentType, stored.etag);
}

async function migrateOriginImage(request, key) {
  const upstream = await sourceFetch(uploadPath(key), request, "GET", null);
  if (!upstream.ok) return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: upstream.headers });
  const data = await upstream.arrayBuffer();
  const extension = key.slice(key.lastIndexOf(".")).toLowerCase();
  const contentType = upstream.headers.get("content-type") || extensionTypes[extension] || "application/octet-stream";
  try {
    await (await getImageStore()).set(key, data, { metadata: { contentType } });
  } catch (error) {
    // The original storage remains a safe fallback if the free Blob store is unavailable.
    console.error("Image cache migration failed", { key, message: error?.message });
  }
  return imageResponse(data, contentType, upstream.headers.get("etag"));
}

async function serveImage(request, key) {
  const migrated = await serveMigratedImage(key);
  if (migrated) return migrated;
  try {
    const stored = await serveStoredImage(key);
    if (stored) return stored;
  } catch (error) {
    console.error("Blob image read failed", { key, message: error?.message });
  }
  return migrateOriginImage(request, key);
}

async function uploadImage(request) {
  // Clone before parsing so that the existing storage can still accept the upload
  // whenever the free Blob service is temporarily unavailable.
  const originCopy = request.clone();
  let status;
  try {
    status = await sourceFetch("/api/admin/status", request, "GET", null);
    if (!status.ok) return proxyToCurrentSite(originCopy);
    const session = await status.json();
    if (!session.authenticated) return json({ error: "请先登录后台" }, 401);
  } catch (error) {
    console.error("Admin status check failed", { message: error?.message });
    return proxyToCurrentSite(originCopy);
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") return json({ error: "请选择图片文件" }, 400);
    const type = String(file.type || "").toLowerCase();
    if (!imageTypes[type]) return json({ error: "仅支持 JPG、PNG、WebP 或 GIF 图片" }, 400);
    const maxUploadBytes = 5 * 1024 * 1024;
    if (!file.size || file.size > maxUploadBytes) return json({ error: "图片大小不能超过 5MB" }, 400);
    const key = `dishes/${Date.now()}-${crypto.randomUUID()}.${imageTypes[type]}`;
    await (await getImageStore()).set(key, await file.arrayBuffer(), { metadata: { contentType: type, originalName: String(file.name || "").slice(0, 120) } });
    return json({ url: uploadPath(key) }, 201);
  } catch (error) {
    // Keep uploads usable while retaining the old service as a no-data-loss fallback.
    console.error("Blob image upload failed", { message: error?.message });
    return proxyToCurrentSite(originCopy);
  }
}

export default async function handler(request) {
  const url = new URL(request.url);
  const uploadMatch = url.pathname.match(/^\/uploads\/(.+)$/);
  if (request.method === "GET" && uploadMatch) return serveImage(request, decodeURIComponent(uploadMatch[1]));
  if (request.method === "POST" && url.pathname === "/api/admin/uploads") return uploadImage(request);
  if (request.method === "GET" && url.pathname === "/api/menu") return proxyMenu(request);
  const response = await proxyToCurrentSite(request);
  if (response.ok && isMenuMutation(request, url.pathname)) menuCache = { payload: null, expiresAt: 0 };
  return response;
}

export const config = {
  path: ["/api/*", "/uploads/*"],
};
