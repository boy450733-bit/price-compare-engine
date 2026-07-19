import { Router } from "express";
import { query as db } from "../db/client.js";
import { enqueueScrape } from "../queue/queue.js";

const router = Router();
const STALE_HOURS = Number(process.env.CACHE_STALE_HOURS || 12);
const MIN_STORE_COUNT = Number(process.env.CACHE_MIN_STORE_COUNT || 3);

const SORT_MAP = {
  relevance: 'similarity(p.title, $1) DESC, p.price ASC',
  price_asc: "p.price ASC NULLS LAST",
  price_desc: "p.price DESC NULLS LAST",
  rating: "p.rating DESC NULLS LAST",
};

router.get("/products", async (req, res) => {
  const q = (req.query.q || "").trim();
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const page = Number(req.query.page) || 1;
  const sort = SORT_MAP[req.query.sort] ? req.query.sort : "relevance";
  const minPrice = req.query.minPrice ? Number(req.query.minPrice) : null;
  const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : null;
  const inStockOnly = req.query.inStockOnly === "true";
  const stores = req.query.stores ? req.query.stores.split(",").filter(Boolean) : null;

  if (!q) return res.status(400).json({ error: "missing query param: q" });

  // Build WHERE clause dynamically for the optional filters, keeping
  // $1 reserved for the search query text (needed by the similarity()
  // calls in both WHERE and ORDER BY).
  const params = [q];
  const conditions = ["p.title % $1"];

  if (minPrice !== null) {
    params.push(minPrice);
    conditions.push(`p.price >= $${params.length}`);
  }
  if (maxPrice !== null) {
    params.push(maxPrice);
    conditions.push(`p.price <= $${params.length}`);
  }
  if (inStockOnly) {
    conditions.push("p.in_stock = true");
  }
  if (stores && stores.length > 0) {
    params.push(stores);
    conditions.push(`p.store = ANY($${params.length})`);
  }

  const whereClause = conditions.join(" AND ");

  params.push(limit, (page - 1) * limit);
  const limitParam = params.length - 1;
  const offsetParam = params.length;

  // storeColor comes from the `stores` table, not `products` — this join
  // is the fix for the color badges never rendering on the frontend.
  const { rows: rawRows } = await db(
    `SELECT p.*, s.color AS "storeColor"
     FROM products p
     JOIN stores s ON s.name = p.store
     WHERE ${whereClause}
     ORDER BY ${SORT_MAP[sort]}
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params
  );

  // Defensive dedup by URL. Each product's id is a deterministic hash of
  // (store, url), so true duplicate rows shouldn't exist in normal
  // operation — but URL variations across re-scrapes (protocol, trailing
  // slash, tracking params) could in theory produce near-duplicates.
  // Cheap insurance: keep only the first (best-ranked) occurrence per URL.
  const seenUrls = new Set();
  const rows = rawRows.filter((r) => {
    if (seenUrls.has(r.url)) return false;
    seenUrls.add(r.url);
    return true;
  });

  const { rows: storeCountRows } = await db(
    `SELECT COUNT(DISTINCT store) AS count FROM products WHERE title % $1`,
    [q]
  );
  const storeCount = Number(storeCountRows[0]?.count || 0);

  const { rows: freshnessRows } = await db(
    `SELECT MIN(scraped_at) AS oldest FROM products WHERE title % $1`,
    [q]
  );
  const oldest = freshnessRows[0]?.oldest;
  const isStale =
    !oldest || (Date.now() - new Date(oldest).getTime()) / 36e5 > STALE_HOURS;

  const needsLiveScrape = isStale || storeCount < MIN_STORE_COUNT;

  if (needsLiveScrape) {
    enqueueScrape(q).catch((err) =>
      console.error("failed to enqueue scrape:", err.message)
    );
  }

  await db(`INSERT INTO search_log (query, store_count) VALUES ($1, $2)`, [
    q,
    storeCount,
  ]);

  res.json({
    total: rows.length,
    page,
    limit,
    products: rows,
    filteredCount: rows.length,
    needsLiveScrape,
    storeCount,
  });
});

export default router;
