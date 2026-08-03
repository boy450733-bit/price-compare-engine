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
  const limit = Math.min(Number(req.query.limit) || 12, 1000);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
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

  // Push limit and offset indices for the final query
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  const queryParams = [...params, limit, offset];

  const { rows: rawRows } = await db(
    `WITH filtered_products AS (
        SELECT p.*, s.color AS store_color
        FROM products p
        JOIN stores s ON s.name = p.store
        WHERE s.enabled = true AND ${whereClause}
    ),
    grouped AS (
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
                    'id', p.id,
                    'store', p.store,
                    'price', p.price,
                    'url', p.url,
                    'in_stock', p.in_stock,
                    'rating', p.rating,
                    'storeColor', p.store_color
                )
                ORDER BY p.price ASC
            ) AS offers
        FROM filtered_products p
        GROUP BY p.fingerprint
    ),
    paged AS (
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
            specs_text,
            scraped_at,
            offers,
            (SELECT COUNT(*) FROM grouped) AS "totalCount"
        FROM grouped
        ORDER BY ${SORT_EXPR[sort].outer}
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
    )
    SELECT * FROM paged`,
    queryParams
  );
  
  const total = rawRows.length ? Number(rawRows[0].totalCount) : 0;
  const rows = rawRows.map(({ totalCount, offers, specs_text, ...r }) => ({
    ...r,
    specs: specs_text ? (typeof specs_text === 'string' ? JSON.parse(specs_text) : specs_text) : null,
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
    offset,
    limit,
    products: rows,
    filteredCount: rows.length,
    needsLiveScrape,
    storeCount,
  });
});

// Inside your admin or public API routes
// Inside your /top-searches route
router.get("/top-searches", async (req, res) => {
  try {
    // Fixed table name from "searches" to "search_log" to match your insert statement
    const { rows } = await db(`
      SELECT query, COUNT(*) as query_count 
      FROM search_log 
      GROUP BY query 
      ORDER BY query_count DESC 
      LIMIT 10
    `);
    
    // If no searches exist yet, provide fallback queries
    const queries = rows.length > 0 ? rows.map(r => r.query) : ["Xiaomi Redmi", "Samsung Galaxy", "Infinix"];
    res.json({ queries });
  } catch (err) {
    console.error("Failed to fetch top searches:", err.message);
    res.status(500).json({ queries: ["Xiaomi Redmi", "Samsung Galaxy"] });
  }
});

// Route for top deals
router.get("/deals", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 12, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  try {
    const { rows: rawRows } = await db(
      `WITH ranked_prices AS (
          SELECT
              ph.product_id,
              ph.price,
              ph.recorded_at,
              ROW_NUMBER() OVER (
                  PARTITION BY ph.product_id
                  ORDER BY ph.recorded_at DESC
              ) AS rn
          FROM price_history ph
       ),
       latest_two AS (
          SELECT
              product_id,
              MAX(CASE WHEN rn = 1 THEN price END) AS new_price,
              MAX(CASE WHEN rn = 2 THEN price END) AS old_price
          FROM ranked_prices
          WHERE rn <= 2
          GROUP BY product_id
          HAVING COUNT(*) = 2
       )
       SELECT
          lt.product_id AS id,
          p.title,
          p.image,
          p.category,
          p.brand,
          p.store,
          p.url,
          p.rating,
          p.scraped_at,
          lt.old_price,
          lt.new_price AS min_price,
          (lt.old_price - lt.new_price) AS price_drop,
          ROUND(((lt.old_price - lt.new_price) / NULLIF(lt.old_price, 0)) * 100, 1) AS discount_pct,
          s.color AS store_color,
          COUNT(*) OVER() AS "totalCount"
       FROM latest_two lt
       JOIN products p ON p.id = lt.product_id
       JOIN stores s ON s.name = p.store
       WHERE lt.new_price < lt.old_price AND s.enabled = true
       ORDER BY (lt.old_price - lt.new_price) DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const total = rawRows.length ? Number(rawRows[0].totalCount) : 0;

    // Transform products into card-compatible layout objects
    const products = rawRows.map((p) => ({
      id: p.id,
      title: p.title,
      image: p.image,
      category: p.category || "Mobile",
      brand: p.brand || "General",
      min_price: p.min_price,
      old_price: p.old_price,
      price_drop: p.price_drop,
      discount_pct: p.discount_pct,
      max_rating: p.rating,
      scraped_at: p.scraped_at,
      offers: [
        {
          id: p.id,
          store: p.store,
          price: p.min_price,
          url: p.url,
          in_stock: true,
          storeColor: p.store_color
        }
      ]
    }));

    res.json({
      total,
      limit,
      offset,
      products
    });
  } catch (err) {
    console.error("Failed to fetch top deals:", err.message);
    res.status(500).json({ error: "Failed to fetch top deals" });
  }
});

export default router;
