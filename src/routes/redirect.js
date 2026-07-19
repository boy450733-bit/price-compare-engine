import { Router } from "express";
import crypto from "node:crypto";
import { nanoid } from "nanoid";

import { query as db } from "../db/client.js";
import { allStoreConfigs } from "../adapters/stores/index.js";

const router = Router();

const configByName = Object.fromEntries(
  allStoreConfigs.map((config) => [config.name, config])
);

router.get("/out/:productId", async (req, res) => {
  try {
    const { productId } = req.params;

    console.log(`Redirect request: ${productId}`);

    // Find product
    const { rows } = await db(
      `
      SELECT
        p.id,
        p.url,
        p.store,
        s.affiliate_param
      FROM products p
      LEFT JOIN stores s
        ON s.name = p.store
      WHERE p.id = $1
      LIMIT 1
      `,
      [productId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const product = rows[0];

    const clickRef = nanoid(10);

    const ipHash = crypto
      .createHash("sha256")
      .update(req.ip || "")
      .digest("hex");

    // Log click (don't fail redirect if logging fails)
    try {
      await db(
        `
        INSERT INTO clicks
        (click_ref, product_id, ip_hash)
        VALUES ($1,$2,$3)
        `,
        [clickRef, product.id, ipHash]
      );
    } catch (err) {
      console.error("Failed to record click:", err.message);
    }

    const redirectUrl = buildAffiliateUrl(product, clickRef);

    console.log("Redirecting to:", redirectUrl);

    return res.redirect(302, redirectUrl);
  } catch (err) {
    console.error("Redirect route failed:");
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
      code: err.code,
      detail: err.detail,
    });
  }
});

function buildAffiliateUrl(product, clickRef) {
  const config = configByName[product.store];

  // Store-specific affiliate builder
  if (config?.buildAffiliateUrl) {
    return config.buildAffiliateUrl(product.url, clickRef);
  }

  // Generic affiliate parameter
  if (product.affiliate_param) {
    const separator = product.url.includes("?") ? "&" : "?";

    return (
      product.url +
      separator +
      product.affiliate_param.replace(/^\?/, "")
    );
  }

  return product.url;
}

export default router;
