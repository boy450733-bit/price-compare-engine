import crypto from "node:crypto";

// Same store+url always produces the same id, so re-scraping the same
// listing is a clean upsert (ON CONFLICT DO UPDATE) instead of a duplicate.
export function productId(store, url) {
  return crypto.createHash("md5").update(`${store}|${url}`).digest("hex");
}
