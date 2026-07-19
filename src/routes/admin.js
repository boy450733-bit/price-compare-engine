import { Router } from "express";
import { query as db } from "../db/client.js";

const router = Router();

// Simple shared-secret auth — fine for a single-operator admin panel.
// Set ADMIN_TOKEN in your environment (Railway → Variables). Every
// request below requires `Authorization: Bearer <ADMIN_TOKEN>`.
router.use((req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!process.env.ADMIN_TOKEN) {
    return res.status(500).json({ error: "ADMIN_TOKEN not configured on the server" });
  }
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

// List all stores with full config (including disabled ones, unlike the
// public /api/stores endpoint which only shows enabled ones).
router.get("/stores", async (_req, res) => {
  const { rows } = await db(`SELECT * FROM stores ORDER BY name`);
  res.json({ stores: rows });
});

// Update a store's enabled flag, color, or affiliate_param.
// Note: this only affects the DATABASE row — it does not touch the
// store's code config (adapters/stores/*.config.js). Disabling a store
// here stops it being scraped (scrape.js only queries enabled stores)
// and stops it appearing in the public store list/marquee, but the code
// file still exists for when you want to re-enable it.
router.patch("/stores/:name", async (req, res) => {
  const { name } = req.params;
  const { enabled, color, affiliate_param } = req.body;

  const { rows } = await db(
    `UPDATE stores SET
       enabled = COALESCE($2, enabled),
       color = COALESCE($3, color),
       affiliate_param = COALESCE($4, affiliate_param)
     WHERE name = $1
     RETURNING *`,
    [name, enabled, color, affiliate_param]
  );

  if (!rows[0]) return res.status(404).json({ error: "Store not found" });
  res.json({ store: rows[0] });
});

// Worklist: products that have been clicked but have no manually-converted
// affiliate link yet, sorted by click volume — same data as
// scripts/affiliate-worklist.js, just exposed over HTTP for the panel.
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

// Existing manually-converted affiliate links, for review/editing —
// separate from the worklist above (which only shows products still
// missing a link).
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

// Save a manually-converted affiliate link for a product.
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

// Site settings — branding, theme, and which optional card fields show
// on the storefront. Admin sees/edits the raw stored row (which may be
// partial); the PUBLIC /api/settings endpoint is what merges it with
// defaults for the frontend, so this one can just return what's saved.
router.get("/settings", async (_req, res) => {
  const { rows } = await db(`SELECT data FROM site_settings WHERE id = 1`);
  res.json(rows[0]?.data || {});
});

router.put("/settings", async (req, res) => {
  await db(
    `INSERT INTO site_settings (id, data, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()`,
    [JSON.stringify(req.body)]
  );
  res.json({ ok: true });
});

// Basic stats for the admin dashboard header.
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

export default router;
