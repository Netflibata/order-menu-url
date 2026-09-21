import { getStore } from "@netlify/blobs";

export function createNetlifyBucket(storeName = "dish-images") {
  const store = getStore(storeName);

  return {
    async put(key, value, options = {}) {
      await store.set(key, value, {
        metadata: {
          contentType: options.httpMetadata?.contentType || "application/octet-stream",
          originalName: options.customMetadata?.originalName || "",
        },
      });
    },
    async get(key) {
      const [body, info] = await Promise.all([
        store.get(key, { type: "arrayBuffer" }),
        store.getMetadata(key),
      ]);
      if (!body) return null;
      return {
        body,
        httpEtag: info?.etag || "",
        writeHttpMetadata(headers) {
          headers.set("content-type", info?.metadata?.contentType || "application/octet-stream");
        },
      };
    },
    async delete(key) {
      await store.delete(key);
    },
  };
}
