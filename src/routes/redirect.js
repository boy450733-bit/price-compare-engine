import { Router } from "express";
import { query as db } from "../db/client.js";
import crypto from "crypto";

const router = Router();

// Handle cleaner product click tracking and redirection via /out/:id
router.get("/out/:id", async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).send("Missing product ID for redirection.");
  }

  try {
    // 1. Fetch the product details from the database
    const { rows: prodRows } = await db(
      `SELECT id, title, store, url FROM products WHERE id = $1`,
      [id]
    );

    if (prodRows.length === 0) {
      return res.status(404).send("Product not found or expired.");
    }

    const product = prodRows[0];
    let finalDestinationUrl = product.url;

    // 2. Check if a manual custom affiliate link exists for this product ID
    const { rows: affRows } = await db(
      `SELECT affiliate_url FROM affiliate_links WHERE product_id = $1`,
      [id]
    );
    if (affRows[0]?.affiliate_url) {
      finalDestinationUrl = affRows[0].affiliate_url;
    } else {
      // 3. If no manual link, check if the store has an automatic affiliate parameter
      const { rows: storeRows } = await db(
        `SELECT affiliate_param FROM stores WHERE name = $1`,
        [product.store]
      );
      const affiliateParam = storeRows[0]?.affiliate_param;

      if (affiliateParam && finalDestinationUrl) {
        const separator = finalDestinationUrl.includes("?") ? "&" : "?";
        finalDestinationUrl = `${finalDestinationUrl}${separator}${affiliateParam}`;
      }
    }

    // Capture IP hash and check for any reference/affiliate query parameters in the URL
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ipHash = clientIp ? crypto.createHash('sha256').update(clientIp).digest('hex') : null;
    
    // Checks for ?aff=..., ?ref=..., ?source=..., or ?click_ref=...
    const clickRef = req.query.aff || req.query.ref || req.query.source || req.query.click_ref || req.query.refid || req.query.referal || req.query.uid null;

    // 5. Log the click asynchronously including ip_hash and click_ref
    db(
      `INSERT INTO clicks (product_id, ip_hash, click_ref, clicked_at) VALUES ($1, $2, $3, now())`,
      [product.id, ipHash, clickRef]
    ).catch((err) => console.error("Failed to log click:", err.message));

    // 6. Perform the final redirect
    return res.redirect(302, finalDestinationUrl);
  } catch (err) {
    console.error("Redirection error:", err.message);
    return res.status(500).send("Internal server error during redirection.");
  }
});

// Fallback legacy redirect route (just in case old links are cached in browsers)
router.get("/redirect", async (req, res) => {
  const { productId, store, url } = req.query;
  if (productId) {
    return res.redirect(302, `/out/${productId}`);
  }
  if (url) {
    return res.redirect(302, url);
  }
  return res.status(400).send("Missing redirection parameters.");
});

export default router;
