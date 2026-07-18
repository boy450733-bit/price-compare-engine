import { Router } from "express";
import crypto from "node:crypto";
import { query as db } from "../db/client.js";

const router = Router();

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

  // Log the click (hash the IP instead of storing it raw).
  const ipHash = crypto
    .createHash("sha256")
    .update(req.ip || "")
    .digest("hex");

  await db(`INSERT INTO clicks (product_id, ip_hash) VALUES ($1, $2)`, [
    productId,
    ipHash,
  ]);

  const finalUrl = product.affiliate_param
    ? `${product.url}${product.url.includes("?") ? "&" : "?"}${product.affiliate_param.replace(/^\?/, "")}`
    : product.url;

  res.redirect(302, finalUrl);
});

export default router;
