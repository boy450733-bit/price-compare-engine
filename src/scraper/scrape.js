import { query } from "../db/client.js";
import { productId } from "../utils/hash.js";
import { getAdapter } from "../adapters/index.js";
import { processProduct } from "../intelligence/index.js";

export async function scrapeStoreForQuery(storeName, searchQuery) {
  const adapter = getAdapter(storeName);
  if (!adapter) {
    console.warn(`No adapter found for store: ${storeName}`);
    return 0;
  }

  const listings = await adapter(searchQuery);

  for (const listing of listings) {
    // 1. Process listing through your intelligence layer middleware
    const product = processProduct(listing, searchQuery, storeName);

    //
    console.log("FINAL PRODUCT START");
    console.log(JSON.stringify(product, null, 2));
    console.log("FINAL PRODUCT ENDS");

    // If the intelligence layer flags this item as noise/irrelevant, skip it
    if (!product.accepted) continue;

    const id = productId(storeName, product.url);

    
    // 2. Insert enriched intelligence metadata into PostgreSQL
    await query(
      `INSERT INTO products (
        id,
        title,
        brand,
        model,
        category,
        normalized_title,
        specs,
        fingerprint,
        match_score,
        store,
        url,
        image,
        price,
        original_price,
        rating,
        review_count,
        in_stock,
        source_query,
        scraped_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, NOW()
      )
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

    // 3. Log price history for trends
    await query(
      `INSERT INTO price_history (product_id, price) VALUES ($1, $2)`,
      [id, product.price]
    );
  }

  return listings.length;
}

export async function scrapeAllStoresForQuery(searchQuery) {
  const { rows: stores } = await query(
    `SELECT name FROM stores WHERE enabled = true`
  );

  const results = await Promise.allSettled(
    stores.map((s) => scrapeStoreForQuery(s.name, searchQuery))
  );

  return results;
}
