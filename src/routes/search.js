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

// ------------------------------------------------------------
// Single product details
// Full product + all enabled store offers + gallery images
// ------------------------------------------------------------
router.get("/products/:id", async (req, res) => {
  try {
    const productId = String(req.params.id || "").trim();

    if (!productId) {
      return res.status(400).json({
        error: "Invalid product ID"
      });
    }

    // ----------------------------------------------------------
    // Find the requested product and canonical fingerprint
    // ----------------------------------------------------------
    const { rows: baseRows } = await db(
      `
      SELECT
        p.id,
        p.fingerprint,
        p.title,
        p.image,
        p.brand,
        p.model,
        p.category,
        p.specs,
        p.scraped_at
      FROM products p
      WHERE p.id::text = $1
      LIMIT 1
      `,
      [productId]
    );

    if (!baseRows.length) {
      return res.status(404).json({
        error: "Product not found"
      });
    }

    const baseProduct = baseRows[0];

    // ----------------------------------------------------------
    // All current offers for the same canonical product
    // Also retrieve each store's own product image.
    // ----------------------------------------------------------
    const { rows: offerRows } = await db(
      `
      SELECT
        p.id,
        p.store,
        p.price,
        p.url,
        p.image,
        p.in_stock,
        p.rating,
        p.scraped_at,
        s.color AS "storeColor"
      FROM products p
      JOIN stores s
        ON s.name = p.store
      WHERE
        p.fingerprint = $1
        AND s.enabled = true
      ORDER BY
        p.price ASC NULLS LAST
      `,
      [baseProduct.fingerprint]
    );

    // ----------------------------------------------------------
    // Build unique image gallery.
    //
    // Primary image is always first.
    // Then add unique store images.
    // Maximum 8 images to keep payload reasonable.
    // ----------------------------------------------------------
    const images = [];
    const seenImages = new Set();

    const addImage = (url) => {
      if (!url || typeof url !== "string") return;

      const clean = url.trim();

      if (!clean || seenImages.has(clean)) return;

      seenImages.add(clean);
      images.push(clean);
    };

    addImage(baseProduct.image);

    for (const offer of offerRows) {
      addImage(offer.image);

      if (images.length >= 8) break;
    }

    // ----------------------------------------------------------
    // Price statistics
    // ----------------------------------------------------------
    const validPrices = offerRows
      .map(o => Number(o.price))
      .filter(price => Number.isFinite(price) && price > 0);

    const minPrice = validPrices.length
      ? Math.min(...validPrices)
      : null;

    const maxPrice = validPrices.length
      ? Math.max(...validPrices)
      : null;

    const ratings = offerRows
      .map(o => Number(o.rating))
      .filter(rating => Number.isFinite(rating));

    const maxRating = ratings.length
      ? Math.max(...ratings)
      : null;

    // ----------------------------------------------------------
    // Final product object
    // ----------------------------------------------------------
    const product = {
      id: baseProduct.id,
      fingerprint: baseProduct.fingerprint,

      title: baseProduct.title,
      image: baseProduct.image,
      images,

      brand: baseProduct.brand,
      model: baseProduct.model,
      category: baseProduct.category || "Mobile",

      specs: baseProduct.specs || null,

      min_price: minPrice,
      max_price: maxPrice,
      max_rating: maxRating,

      scraped_at: baseProduct.scraped_at,

      offers: offerRows.map(o => ({
        id: o.id,
        store: o.store,
        price: o.price,
        url: o.url,
        image: o.image,
        in_stock: o.in_stock,
        rating: o.rating,
        scraped_at: o.scraped_at,
        storeColor: o.storeColor
      }))
    };

    res.json({
      product
    });

  } catch (err) {
    console.error(
      "Failed to fetch product:",
      err.message
    );

    res.status(500).json({
      error: "Failed to fetch product"
    });
  }
});

// ------------------------------------------------------------
// Trending / popular products
//
// Lightweight endpoint:
// NO offers array.
// Returns only information required by trending cards.
// ------------------------------------------------------------
router.get("/trending-products", async (req, res) => {
  const limit = Math.min(
    Math.max(Number(req.query.limit) || 8, 1),
    12
  );

  const excludeId = req.query.excludeId
    ? String(req.query.excludeId)
    : null;

  try {
    const { rows } = await db(
      `
      WITH normalized_searches AS (
        SELECT
          LOWER(
            REGEXP_REPLACE(
              REPLACE(TRIM(query), '+', ' '),
              '\\s+',
              ' ',
              'g'
            )
          ) AS normalized_query,

          TRIM(
            REGEXP_REPLACE(
              REPLACE(query, '+', ' '),
              '\\s+',
              ' ',
              'g'
            )
          ) AS display_query

        FROM search_log

        WHERE
          query IS NOT NULL
          AND TRIM(query) <> ''
      ),

      top_queries AS (
        SELECT
          normalized_query,
          MIN(display_query) AS display_query,
          COUNT(*) AS search_count

        FROM normalized_searches

        WHERE LENGTH(normalized_query) >= 2

        GROUP BY normalized_query

        ORDER BY search_count DESC

        LIMIT $2
      ),

      matched_products AS (

        SELECT
          tq.normalized_query,
          tq.display_query,
          tq.search_count,

          match.id,
          match.fingerprint,
          match.title,
          match.image,
          match.brand,
          match.model,
          match.category,
          match.min_price,
          match.max_price,
          match.max_rating,
          match.store_count,
          match.best_store,
          match.best_store_color,
          match.trend_direction

        FROM top_queries tq

        CROSS JOIN LATERAL (

          SELECT
            MIN(p.id::text) AS id,

            p.fingerprint,

            MAX(p.title) AS title,
            MAX(p.image) AS image,
            MAX(p.brand) AS brand,
            MAX(p.model) AS model,
            MAX(p.category) AS category,

            MIN(p.price) AS min_price,
            MAX(p.price) AS max_price,

            MAX(
              COALESCE(p.rating, 0)
            ) AS max_rating,

            COUNT(DISTINCT p.store) AS store_count,

            (
              ARRAY_AGG(
                p.store
                ORDER BY p.price ASC NULLS LAST
              )
            )[1] AS best_store,

            (
              ARRAY_AGG(
                s.color
                ORDER BY p.price ASC NULLS LAST
              )
            )[1] AS best_store_color,

            MAX(
              similarity(
                LOWER(p.title),
                tq.normalized_query
              )
            ) AS match_score,

            CASE
              WHEN EXISTS (
                SELECT 1
                FROM price_history ph
                WHERE ph.product_id::text = ANY(
                  ARRAY_AGG(p.id::text)
                )
                AND ph.recorded_at >= NOW() - INTERVAL '90 days'
              )
              THEN 'stable'
              ELSE 'stable'
            END AS trend_direction

          FROM products p

          JOIN stores s
            ON s.name = p.store

          WHERE
            s.enabled = true

            AND p.title % tq.normalized_query

            AND (
              $1::text IS NULL
              OR p.id::text <> $1::text
            )

          GROUP BY p.fingerprint

          ORDER BY
            match_score DESC,
            min_price ASC NULLS LAST

          LIMIT 1

        ) match
      )

      SELECT
        normalized_query,
        display_query,
        search_count,

        id,
        fingerprint,
        title,
        image,
        brand,
        model,
        category,

        min_price,
        max_price,
        max_rating,

        store_count,

        best_store,
        best_store_color,

        trend_direction

      FROM matched_products

      ORDER BY
        search_count DESC,
        min_price ASC NULLS LAST
      `,
      [excludeId, limit]
    );

    // ----------------------------------------------------------
    // Remove duplicate canonical products.
    // ----------------------------------------------------------
    const seen = new Set();

    const products = [];

    for (const row of rows) {
      if (!row.fingerprint) continue;

      if (seen.has(row.fingerprint)) {
        continue;
      }

      seen.add(row.fingerprint);

      const minPrice =
        row.min_price !== null
          ? Number(row.min_price)
          : null;

      const maxPrice =
        row.max_price !== null
          ? Number(row.max_price)
          : null;

      const saving =
        minPrice !== null &&
        maxPrice !== null &&
        maxPrice > minPrice
          ? maxPrice - minPrice
          : 0;

      products.push({
        query: row.display_query,
        search_count: Number(row.search_count || 0),

        product: {
          id: row.id,
          fingerprint: row.fingerprint,

          title: row.title,
          image: row.image,

          brand: row.brand,
          model: row.model,
          category: row.category || "Mobile",

          min_price: minPrice,
          max_price: maxPrice,

          max_rating:
            row.max_rating !== null
              ? Number(row.max_rating)
              : 0,

          store_count:
            Number(row.store_count || 0),

          saving,

          best_store:
            row.best_store || "Multiple stores",

          best_store_color:
            row.best_store_color || "#0B6E4F",

          trend_direction:
            row.trend_direction || "stable"
        }
      });
    }

    res.json({
      queries: products.map(p => p.query),
      products
    });

  } catch (err) {
    console.error(
      "Failed to fetch trending products:",
      err.message
    );

    res.status(500).json({
      error: "Failed to fetch trending products",
      queries: [],
      products: []
    });
  }
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
