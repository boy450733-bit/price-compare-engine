import { Router } from "express";
import { query as db } from "../db/client.js";
import { enqueueScrape } from "../queue/queue.js";

const router = Router();
const STALE_HOURS = Number(process.env.CACHE_STALE_HOURS || 12);
const MIN_STORE_COUNT = Number(process.env.CACHE_MIN_STORE_COUNT || 3);

router.get("/products", async (req, res) => {
  const q = (req.query.q || "").trim();
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const page = Number(req.query.page) || 1;

  if (!q) return res.status(400).json({ error: "missing query param: q" });

  // Full-text/fuzzy search against cached products (pg_trgm similarity).
  const { rows } = await db(
    `SELECT * FROM products
     WHERE title % $1
     ORDER BY similarity(title, $1) DESC, price ASC
     LIMIT $2 OFFSET $3`,
    [q, limit, (page - 1) * limit]
  );

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
    // Fire and forget — don't block the response on the scrape.
    enqueueScrape(q).catch((err) =>
      console.error("failed to enqueue scrape:", err.message)
    );
  }

  await db(
    `INSERT INTO search_log (query, store_count) VALUES ($1, $2)`,
    [q, storeCount]
  );

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
