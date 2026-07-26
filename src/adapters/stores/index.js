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

