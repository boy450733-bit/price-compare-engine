import { pool } from "../db/client.js";
import { createAdapter } from "./createAdapter.js";
import { genericAdapter } from "./generic.js";

const adapterCache = {};

/**
 * Dynamically retrieves or creates an adapter for a given store name from the database.
 */
export async function getAdapter(storeName) {
  if (!storeName) return genericAdapter;

  if (adapterCache[storeName]) {
    return adapterCache[storeName];
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM stores WHERE name = $1 AND enabled = true`,
      [storeName]
    );

    if (rows.length === 0) {
      return genericAdapter;
    }

    const store = rows[0];
    const config = {
      name: store.name,
      baseUrl: store.base_url,
      searchUrl: (q) => {
        const formattedQuery = encodeURIComponent(q.trim().split(/\s+/).join("+"));
        return store.search_url_template 
          ? store.search_url_template.replace("{query}", formattedQuery)
          : `${store.base_url}/search/${formattedQuery}/`;
      },
      selectors: store.selectors || {}
    };

    adapterCache[storeName] = createAdapter(config);
    return adapterCache[storeName];
  } catch (err) {
    console.error(`Failed to load adapter for store [${storeName}]:`, err.message);
    return genericAdapter;
  }
}