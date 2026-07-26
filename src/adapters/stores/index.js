import { pool } from "../../db/client.js";
import { createAdapter } from "../createAdapter.js";

/**
 * Dynamically loads active store configurations and selectors from PostgreSQL,
 * wrapping them into working scrapers using createAdapter.
 */
export async function getActiveAdapters() {
  try {
    const { rows } = await pool.query(`SELECT * FROM stores WHERE enabled = true`);
    
    if (rows.length === 0) {
      console.warn("No active stores found in database.");
      return [];
    }

    return rows.map(store => {
      const config = {
        name: store.name,
        baseUrl: store.base_url,
        searchUrl: (q) => {
          const formattedQuery = encodeURIComponent(q.trim().split(/\s+/).join("+"));
          // Uses the stored template (e.g., "https://www.mega.pk/search/{query}/")
          return store.search_url_template 
            ? store.search_url_template.replace("{query}", formattedQuery)
            : `${store.base_url}/search/${formattedQuery}/`;
        },
        selectors: store.selectors || {}
      };

      return {
        name: store.name,
        adapter: createAdapter(config)
      };
    });
  } catch (err) {
    console.error("Failed to load adapters from database:", err.message);
    return [];
  }
}
/*
import { megaConfig } from "./mega.config.js";
import { priceOyeConfig } from "./priceoye.config.js";
import { iShoppingConfig } from "./ishopping.config.js";
import { darazConfig } from "./daraz.config.js";
import { eezepcConfig } from "./eezepc.config.js";
import { shophiveConfig } from "./shophive.config.js";
import { flashiConfig } from "./flashi.config.js";

// This is the ONLY place you list active stores. Both the adapter
// registry (src/adapters/index.js) and the auto-seed step
// (src/server.js) read from this array, so adding a store here is
// enough to make it show up in both places.
export const allStoreConfigs = [
  megaConfig,
  priceOyeConfig,
  iShoppingConfig, // currently blocked by Cloudflare managed challenge — see earlier notes
  darazConfig,
  eezepcConfig,
  shophiveConfig,
  flashiConfig,
];
