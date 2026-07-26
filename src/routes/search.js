// src/routes/search.js
import { Router } from "express";
import { query as db } from "../db/client.js";
import { enqueueScrape } from "../queue/queue.js";

const router = Router();
const STALE_HOURS = Number(process.env.CACHE_STALE_HOURS || 12);
const MIN_STORE_COUNT = Number(process.env.CACHE_MIN_STORE_COUNT || 3);

const SORT_EXPR = {
  relevance: {
    outer: "relevance DESC, min_price ASC",
  },
  price_asc: { outer: "min_price ASC NULLS LAST" },
  price_desc: { outer: "min_price DESC NULLS LAST" },
  rating: { outer: "max_rating DESC NULLS LAST" },
};

router.get("/products", async (req, res) => {
  const q = (req.query.q || "").trim();
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const sort = SORT_EXPR[req.query.sort] ? req.query.sort : "relevance";
  const minPrice = req.query.minPrice ? Number(req.query.minPrice) : null;
  const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : null;
  const inStockOnly = req.query.inStockOnly === "true";
  const stores = req.query.stores ? req.query.stores.split(",").filter(Boolean) : null;

  if (!q) return res.status(400).json({ error: "missing query param: q" });

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

  const { rows: rawRows } = await db(
    `WITH grouped AS (
       SELECT
         p.fingerprint,
         MIN(p.id) AS id,
         MIN(similarity(p.title, $1)) AS relevance,
         MIN(p.price) AS min_price,
         MAX(p.rating) AS max_rating,
         MAX(p.title) AS title,
         MAX(p.image) AS image,
         MAX(p.brand) AS brand,
         MAX(p.model) AS model,
         MAX(p.category) AS category,
         MAX(p.specs::text) AS specs_text,
         MAX(p.scraped_at) AS scraped_at,
         json_agg(
           json_build_object(
             'store', p.store,
             'price', p.price,
             'url', p.url,
             'in_stock', p.in_stock,
             'rating', p.rating,
             'storeColor', s.color
           )
           ORDER BY p.price ASC
         ) AS offers
       FROM products p
       JOIN stores s ON s.name = p.store
       WHERE s.enabled = true AND ${whereClause}
       GROUP BY p.fingerprint
     )
     SELECT 
       id,
       fingerprint,
       relevance,
       min_price,
       max_rating,
       title,
       image,
       brand,
       model,
       category,
       specs_text::json AS specs,
       scraped_at,
       offers,
       COUNT(*) OVER() AS "totalCount"
     FROM grouped
     ORDER BY ${SORT_EXPR[sort].outer}
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params
  );
  
  const total = rawRows.length ? Number(rawRows[0].totalCount) : 0;
  const rows = rawRows.map(({ totalCount, offers, ...r }) => ({
    ...r,
    offers: Array.isArray(offers) ? offers : JSON.parse(offers),
  }));

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
    total,
    page,
    limit,
    products: rows,
    filteredCount: rows.length,
    needsLiveScrape,
    storeCount,
  });
});

export default router;
