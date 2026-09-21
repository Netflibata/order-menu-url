import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import worker from "../worker/index.js";

const types = { ".png": "image/png", ".svg": "image/svg+xml", ".css": "text/css", ".js": "text/javascript" };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1:4173");
    if (url.pathname.startsWith("/assets/") || url.pathname === "/app.js") {
      const file = resolve("public", "." + url.pathname);
      const body = await readFile(file);
      res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const init = { method: req.method, headers: req.headers };
    if (body && req.method !== "GET" && req.method !== "HEAD") init.body = body;
    const response = await worker.fetch(new Request(url, init), {}, {});
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(String(error));
  }
});

server.listen(4173, "127.0.0.1", () => console.log("Local: http://127.0.0.1:4173"));
