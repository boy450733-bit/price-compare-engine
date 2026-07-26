import { pool } from "../../db/client.js";
import { createAdapter } from "../createAdapter.js";

// Cache variables
let cachedAdapters = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Dynamically fetches active store configurations from the database and compiles their adapters,
 * with in-memory caching to optimize performance.
 */
export async function getActiveAdapters() {
  const now = Date.now();

  // Return cached adapters if they are still fresh
  if (cachedAdapters && (now - cacheTimestamp < CACHE_TTL)) {
    return cachedAdapters;
  }

  try {
    const { rows } = await pool.query(
      `SELECT name, color, base_url, search_url_template, affiliate_param, selectors 
       FROM stores 
       WHERE enabled = true`
    );

    cachedAdapters = rows.map((store) => {
      const config = {
        name: store.name,
        color: store.color,
        baseUrl: store.base_url,
        searchUrl: (q) => {
          const formattedQuery = encodeURIComponent(q.trim().split(/\s+/).join("+"));
          return store.search_url_template 
            ? store.search_url_template.replace("{query}", formattedQuery)
            : `${store.base_url}/search/${formattedQuery}/`;
        },
        affiliateParam: store.affiliate_param,
        selectors: store.selectors || {}
      };

      return {
        name: store.name,
        adapter: createAdapter(config)
      };
    });

    cacheTimestamp = now;
    return cachedAdapters;
  } catch (err) {
    console.error("Failed to load active store adapters from database:", err.message);
    // Fallback to expired cache if database has a temporary hiccup, or return empty array
    return cachedAdapters || [];
  }
}

/**
 * Instantly invalidates the cache. 
 * Call this function whenever stores are modified, added, or deleted via the admin panel.
 */
export function invalidateStoreCache() {
  cachedAdapters = null;
  cacheTimestamp = 0;
}
