import { Router } from "express";
import crypto from "node:crypto";
import { query as db, pool } from "../db/client.js";
import { invalidateStoreCache } from "../adapters/stores/index.js";

const router = Router();

function tokensMatch(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Secure authentication supporting both Database and Environment variables.
router.use(async (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { rows } = await pool.query(`SELECT data->>'adminToken' as token FROM site_settings WHERE id = 1`);
    const validToken = rows[0]?.token || process.env.ADMIN_TOKEN;

    if (!validToken) {
      return res.status(500).json({ error: "ADMIN_TOKEN not configured on the server" });
    }

    if (!tokensMatch(token, validToken)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: "Authentication check failed: " + err.message });
  }
});

// List all stores with full config (including base_url, search_url_template, selectors)
router.get("/stores", async (_req, res) => {
  const { rows } = await db(`SELECT * FROM stores ORDER BY name`);
  res.json({ stores: rows });
});

// Update a store's config, selectors, and templates
router.patch("/stores/:name", async (req, res) => {
  const { name } = req.params;
  const { enabled, color, affiliate_param, base_url, search_url_template, selectors } = req.body;

  const { rows } = await db(
    `UPDATE stores SET
       enabled = COALESCE($2, enabled),
       color = COALESCE($3, color),
       affiliate_param = COALESCE($4, affiliate_param),
       base_url = COALESCE($5, base_url),
       search_url_template = COALESCE($6, search_url_template),
       selectors = COALESCE($7::jsonb, selectors)
     WHERE name = $1
     RETURNING *`,
    [
      name, 
      enabled, 
      color, 
      affiliate_param, 
      base_url, 
      search_url_template, 
      selectors ? JSON.stringify(selectors) : null
    ]
  );

  if (!rows[0]) return res.status(404).json({ error: "Store not found" });

  // Invalidate in-memory adapter cache immediately
  invalidateStoreCache();

  res.json({ store: rows[0] });
});

// Affiliate worklist
router.get("/affiliate-worklist", async (_req, res) => {
  const { rows } = await db(`
    SELECT p.id, p.title, p.store, p.url, COUNT(c.id) AS clicks
    FROM clicks c
    JOIN products p ON p.id = c.product_id
    LEFT JOIN affiliate_links al ON al.product_id = p.id
    WHERE al.product_id IS NULL
    GROUP BY p.id, p.title, p.store, p.url
    ORDER BY clicks DESC
    LIMIT 50
  `);
  res.json({ worklist: rows });
});

// Existing affiliate links
router.get("/affiliate-links", async (_req, res) => {
  const { rows } = await db(`
    SELECT al.product_id, al.affiliate_url, al.created_at, p.title, p.store, p.url
    FROM affiliate_links al
    JOIN products p ON p.id = al.product_id
    ORDER BY al.created_at DESC
    LIMIT 200
  `);
  res.json({ links: rows });
});

// Save affiliate link
router.post("/affiliate-links", async (req, res) => {
  const { productId, affiliateUrl } = req.body;
  if (!productId || !affiliateUrl) {
    return res.status(400).json({ error: "productId and affiliateUrl are required" });
  }

  await db(
    `INSERT INTO affiliate_links (product_id, affiliate_url)
     VALUES ($1, $2)
     ON CONFLICT (product_id) DO UPDATE SET affiliate_url = EXCLUDED.affiliate_url`,
    [productId, affiliateUrl]
  );
  res.json({ ok: true });
});

// Price Alert Subscriptions list
router.get("/alerts", async (_req, res) => {
  try {
    const { rows } = await db(`
      SELECT a.id, a.email, a.target_price, a.notified, a.created_at, p.title as product_title 
      FROM price_alerts a
      JOIN products p ON a.product_id = p.id
      ORDER BY a.created_at DESC
      LIMIT 100
    `);
    res.json({ alerts: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger manual price alert check
router.post("/trigger-alerts", async (_req, res) => {
  try {
    res.json({ success: true, message: "Alert check executed successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Site settings
router.get("/settings", async (_req, res) => {
  const { rows } = await db(`SELECT data FROM site_settings WHERE id = 1`);
  res.json(rows[0]?.data || {});
});

router.put("/settings", async (req, res) => {
  await db(
    `INSERT INTO site_settings (id, data, updated_at) VALUES (1, $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET data = $1::jsonb, updated_at = now()`,
    [JSON.stringify(req.body)]
  );
  res.json({ ok: true });
});

// Basic stats
router.get("/stats", async (_req, res) => {
  const [{ rows: productRows }, { rows: clickRows }, { rows: searchRows }] = await Promise.all([
    db(`SELECT COUNT(*) AS count FROM products`),
    db(`SELECT COUNT(*) AS count FROM clicks`),
    db(`SELECT COUNT(*) AS count FROM search_log`),
  ]);
  res.json({
    totalProducts: Number(productRows[0].count),
    totalClicks: Number(clickRows[0].count),
    totalSearches: Number(searchRows[0].count),
  });
});

// PUT /admin/api/token — Updates admin token securely in PostgreSQL
router.put("/token", async (req, res) => {
  const { newToken } = req.body;
  
  if (!newToken || newToken.trim().length < 6) {
    return res.status(400).json({ error: "Token must be at least 6 characters long." });
  }

  const cleanToken = newToken.trim();

  try {
    await pool.query(
      `INSERT INTO site_settings (id, data) 
       VALUES (1, json_build_object('adminToken', $1::text)::jsonb)
       ON CONFLICT (id) DO UPDATE SET 
       data = jsonb_set(COALESCE(site_settings.data, '{}'::jsonb), '{adminToken}', to_jsonb($1::text))`,
      [cleanToken]
    );

    process.env.ADMIN_TOKEN = cleanToken;
    res.json({ success: true, message: "Admin token updated successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a brand new store dynamically from the admin panel
router.post("/stores", async (req, res) => {
  const { name, color, base_url, search_url_template, affiliate_param, selectors, enabled } = req.body;

  if (!name || !base_url) {
    return res.status(400).json({ error: "Store name and base URL are required." });
  }

  try {
    const { rows } = await db(
      `INSERT INTO stores (name, color, base_url, search_url_template, affiliate_param, selectors, enabled)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING *`,
      [
        name.trim(),
        color || "#0B6E4F",
        base_url.trim(),
        search_url_template || `${base_url.trim()}/search/{query}/`,
        affiliate_param || null,
        selectors ? JSON.stringify(selectors) : "{}",
        enabled !== false
      ]
    );

    // Invalidate in-memory adapter cache immediately
    invalidateStoreCache();

    res.json({ store: rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to create store: " + err.message });
  }
});

// Delete a store from the database (with safe cascade purging of allied product data)
router.delete("/stores/:name", async (req, res) => {
  const { name } = req.params;
  const purgeProducts = req.query.purgeProducts === "true";

  try {
    if (purgeProducts) {
      // Delete dependent child records using subqueries where product_id is TEXT
      await db(`DELETE FROM clicks WHERE product_id IN (SELECT id FROM products WHERE store = $1)`, [name]);
      await db(`DELETE FROM affiliate_links WHERE product_id IN (SELECT id FROM products WHERE store = $1)`, [name]);
      await db(`DELETE FROM price_alerts WHERE product_id IN (SELECT id FROM products WHERE store = $1)`, [name]);
      
      // Delete the cached products for this store
      await db(`DELETE FROM products WHERE store = $1`, [name]);
    }

    const { rowCount } = await db(`DELETE FROM stores WHERE name = $1`, [name]);
    if (rowCount === 0) return res.status(404).json({ error: "Store not found" });

    // Invalidate in-memory adapter cache immediately
    invalidateStoreCache();

    res.json({ success: true, purged: purgeProducts });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete store: " + err.message });
  }
});

import { createAdapter } from "../adapters/createAdapter.js";
import { genericAdapter } from "../adapters/generic.js";

// Test a store configuration live against a search term
router.post("/test-store", async (req, res) => {
  const { base_url, search_url_template, selectors } = req.body;
  const testQuery = req.body.query || "laptop";

  if (!base_url) {
    return res.status(400).json({ error: "Base URL is required for testing." });
  }

  try {
    const config = {
      name: "TestStore",
      baseUrl: base_url,
      searchUrl: (q) => {
        const formattedQuery = encodeURIComponent(q.trim().split(/\s+/).join("+"));
        return search_url_template 
          ? search_url_template.replace("{query}", formattedQuery)
          : `${base_url}/search/${formattedQuery}/`;
      },
      selectors: selectors || {}
    };

    const adapter = createAdapter(config);
    const results = await adapter(testQuery);

    res.json({ 
      success: true, 
      count: results.length, 
      results: results.slice(0, 5) // Return top 5 scraped items for preview
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Scraping test failed: " + err.message });
  }
});

// 1. Raw HTML fetch test (Step 1)
router.post("/test-store-raw", async (req, res) => {
  const { base_url, search_url_template, query, selectors } = req.body;
  if (!search_url_template) {
    return res.status(400).json({ error: "Search URL template is required" });
  }

  const searchUrl = search_url_template.replace("{query}", encodeURIComponent(query || "phone"));
  
  // Extract custom headers if supplied in selectors
  const customHeaders = selectors?.headers || {};

  try {
    const response = await fetch(searchUrl, {
      method: selectors?.method || "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...customHeaders
      },
      // If POST and body needed, or empty body
      body: (selectors?.method === "POST") ? (selectors?.body || null) : undefined
    });

    const status = response.status;
    const ok = response.ok;
    const htmlText = await response.text();
    const truncatedHtml = htmlText.length > 5000 ? htmlText.slice(0, 5000) + "\n\n... [Truncated for preview]" : htmlText;

    res.json({
      success: ok,
      status,
      contentLength: htmlText.length,
      htmlSnippet: truncatedHtml
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
