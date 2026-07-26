import { Router } from "express";
import { query as db } from "../db/client.js";
import { getActiveAdapters } from "../adapters/stores/index.js";

const router = Router();

// Track product clicks and redirect users to the correct store product URL
router.get("/redirect", async (req, res) => {
  const { productId, store, url } = req.query;

  if (!url || !store) {
    return res.status(400).send("Missing parameters for redirection.");
  }

  let finalDestinationUrl = url;

  try {
    // 1. Check if a custom manually-converted affiliate link exists for this product
    if (productId) {
      const { rows: affRows } = await db(
        `SELECT affiliate_url FROM affiliate_links WHERE product_id = $1`,
        [productId]
      );
      if (affRows[0]?.affiliate_url) {
        finalDestinationUrl = affRows[0].affiliate_url;
      }
    }

    // 2. If no manual affiliate link, check if the store has an automatic affiliate parameter
    if (finalDestinationUrl === url) {
      const adapters = await getActiveAdapters();
      // Alternatively, query the stores table directly for the affiliate_param
      const { rows: storeRows } = await db(
        `SELECT affiliate_param FROM stores WHERE name = $1`,
        [store]
      );
      const affiliateParam = storeRows[0]?.affiliate_param;

      if (affiliateParam) {
        const separator = finalDestinationUrl.includes("?") ? "&" : "?";
        finalDestinationUrl = `${finalDestinationUrl}${separator}${affiliateParam}`;
      }
    }

    // 3. Log the click asynchronously for admin metrics & worklists
    if (productId) {
      db(
        `INSERT INTO clicks (product_id, store, ip, user_agent) VALUES ($1, $2, $3, $4)`,
        [
          productId,
          store,
          req.headers["x-forwarded-for"] || req.socket.remoteAddress || null,
          req.headers["user-agent"] || null,
        ]
      ).catch((err) => console.error("Failed to log click:", err.message));
    }
  } catch (err) {
    console.error("Redirection tracking error:", err.message);
  }

  // 4. Perform the final redirect
  return res.redirect(302, finalDestinationUrl);
});

export default router;
