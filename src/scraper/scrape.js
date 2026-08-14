import { query } from "../db/client.js";
import { productId } from "../utils/hash.js";
import { getActiveAdapters } from "../adapters/stores/index.js";
import { processProduct } from "../intelligence/index.js";

export async function scrapeStoreForQuery(storeName, adapter, searchQuery) {
  const listings = await adapter(searchQuery);
  if (!listings || listings.length === 0) return 0;

  for (const listing of listings) {
    const product = processProduct(listing, searchQuery, storeName);
    if (!product.accepted) continue;

    const id = productId(storeName, product.url);

    await query(
      `INSERT INTO products (
        id, title, brand, model, category, normalized_title, specs, fingerprint, match_score,
        store, url, image, price, original_price, rating, review_count, in_stock, source_query, scraped_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        brand = EXCLUDED.brand,
        model = EXCLUDED.model,
        category = EXCLUDED.category,
        normalized_title = EXCLUDED.normalized_title,
        specs = EXCLUDED.specs,
        fingerprint = EXCLUDED.fingerprint,
        match_score = EXCLUDED.match_score,
        image = EXCLUDED.image,
        price = EXCLUDED.price,
        original_price = EXCLUDED.original_price,
        rating = EXCLUDED.rating,
        review_count = EXCLUDED.review_count,
        in_stock = EXCLUDED.in_stock,
        scraped_at = NOW()`,
      [
        id,
        product.title,
        product.brand,
        product.model,
        product.category,
        product.normalizedTitle,
        JSON.stringify(product.specs || {}),
        product.fingerprint,
        product.relevanceScore || 0,
        storeName,
        product.url,
        product.image,
        product.price,
        product.originalPrice,
        product.rating,
        product.reviewCount,
        product.inStock,
        searchQuery
      ]
    );

    // Optimized Price History Logic: Prevent duplicate history bloat
    const { rows: historyRows } = await query(
      `SELECT id, price FROM price_history 
       WHERE product_id = $1 
       ORDER BY recorded_at DESC LIMIT 1`,
      [id]
    );

    const lastEntry = historyRows[0];

    if (lastEntry && Number(lastEntry.price) === Number(product.price)) {
      // If price is identical to the latest record, just update its timestamp
      await query(
        `UPDATE price_history 
         SET recorded_at = NOW() 
         WHERE id = $1`,
        [lastEntry.id]
      );
    } else {
      // If price changed or no history exists, insert a new record
      await query(
        `INSERT INTO price_history (product_id, price, recorded_at) VALUES ($1, $2, NOW())`,
        [id, product.price]
      );
    }
  }

  return listings.length;
}

export async function scrapeAllStoresForQuery(searchQuery) {
  const activeAdapters = await getActiveAdapters();
  if (!activeAdapters || activeAdapters.length === 0) {
    console.warn("No active store adapters found in memory/database.");
    return [];
  }

  const results = await Promise.allSettled(
    activeAdapters.map(({ name, adapter }) => scrapeStoreForQuery(name, adapter, searchQuery))
  );

  return results;
}
