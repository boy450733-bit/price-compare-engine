import { Router } from "express";
import { query as db } from "../db/client.js";
import { enqueueScrape } from "../queue/queue.js";

const router = Router();
const STALE_HOURS = Number(process.env.CACHE_STALE_HOURS || 12);
const MIN_STORE_COUNT = Number(process.env.CACHE_MIN_STORE_COUNT || 3);

// Two variants of each sort expression: `inner` is used (with the `p.`
// table prefix) inside the dedup CTE below, `outer` is used against the
// CTE's already-flattened columns (no prefix, since the CTE has already
// collapsed `p.*` + `s.color` into a single row shape).
const SORT_EXPR = {
  relevance: {
    inner: "similarity(p.title, $1) DESC, p.price ASC",
    outer: 'similarity(title, $1) DESC, price ASC',
  },
  price_asc: { inner: "p.price ASC NULLS LAST", outer: "price ASC NULLS LAST" },
  price_desc: { inner: "p.price DESC NULLS LAST", outer: "price DESC NULLS LAST" },
  rating: { inner: "p.rating DESC NULLS LAST", outer: "rating DESC NULLS LAST" },
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

  // Dedup by URL (variations across re-scrapes — protocol, trailing
  // slash, tracking params — can in theory produce near-duplicate rows
  // for the same listing) now happens INSIDE the query via DISTINCT ON,
  // before LIMIT/OFFSET are applied. Doing it after pagination (as this
  // used to) could silently shrink a page below `limit` and shift/skip
  // rows across page boundaries.
  //
  // `COUNT(*) OVER()` gives us the true total match count (post-dedup,
  // pre-pagination) in the same round trip, so `total` in the response
  // reflects the real number of results rather than just this page's size.
  const { rows: rawRows } = await db(
    `WITH deduped AS (
       SELECT DISTINCT ON (p.url) p.*, s.color AS "storeColor"
       FROM products p
       JOIN stores s ON s.name = p.store
       WHERE ${whereClause}
       ORDER BY p.url, ${SORT_EXPR[sort].inner}
     )
     SELECT *, COUNT(*) OVER() AS "totalCount"
     FROM deduped
     ORDER BY ${SORT_EXPR[sort].outer}
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params
  );

  const total = rawRows.length ? Number(rawRows[0].totalCount) : 0;
  const rows = rawRows.map(({ totalCount, ...r }) => r);

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
