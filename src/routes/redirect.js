import { Router } from "express";
import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { query as db } from "../db/client.js";
import { allStoreConfigs } from "../adapters/stores/index.js";

const router = Router();

const configByName = Object.fromEntries(allStoreConfigs.map((c) => [c.name, c]));

router.get("/out/:productId", async (req, res) => {
  const { productId } = req.params;

  const { rows } = await db(
    `SELECT p.url, p.store, s.affiliate_param
     FROM products p
     JOIN stores s ON s.name = p.store
     WHERE p.id = $1`,
    [productId]
  );

  const product = rows[0];
  if (!product) return res.status(404).send("Product not found");

  const clickRef = nanoid(10);
  const ipHash = crypto.createHash("sha256").update(req.ip || "").digest("hex");

  await db(
    `INSERT INTO clicks (click_ref, product_id, ip_hash) VALUES ($1, $2, $3)`,
    [clickRef, productId, ipHash]
  );

  const finalUrl = await buildAffiliateUrl(product, productId, clickRef);
  res.redirect(302, finalUrl);
});

// Decides the outbound URL, in priority order:
// 1. A manually-converted link already exists in `affiliate_links`
//    (for stores like Daraz with no bulk/API tool — see scripts/*).
//    This is checked FIRST since it's the most specific override.
// 2. Store config has a `buildAffiliateUrl` function — for networks that
//    support programmatic deep-linking (append or wrap models).
// 3. Store has a plain `affiliate_param` on it — appended as a query string.
// 4. Nothing set up yet — plain product URL, no tracking. This is the
//    correct default and still works fine as a normal comparison link;
//    it just doesn't earn commission until you configure tracking for
//    that store.
async function buildAffiliateUrl(product, productId, clickRef) {
  const { rows } = await db(
    `SELECT affiliate_url FROM affiliate_links WHERE product_id = $1`,
    [productId]
  );
  if (rows[0]) return rows[0].affiliate_url;

  const config = configByName[product.store];
  if (config?.buildAffiliateUrl) {
    return config.buildAffiliateUrl(product.url, clickRef);
  }

  if (product.affiliate_param) {
    const separator = product.url.includes("?") ? "&" : "?";
    return `${product.url}${separator}${product.affiliate_param.replace(/^\?/, "")}`;
  }

  return product.url;
}

export default router;
