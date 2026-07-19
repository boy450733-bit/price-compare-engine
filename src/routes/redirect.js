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
  const ipHash = crypto
    .createHash("sha256")
    .update(req.ip || "")
    .digest("hex");

  await db(
    `INSERT INTO clicks (click_ref, product_id, ip_hash) VALUES ($1, $2, $3)`,
    [clickRef, productId, ipHash]
  );

  const finalUrl = buildAffiliateUrl(product, clickRef);
  res.redirect(302, finalUrl);
});

function buildAffiliateUrl(product, clickRef) {
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
