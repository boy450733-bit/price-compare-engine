import { query } from "../db/client.js";
import { productId } from "../utils/hash.js";
import { getAdapter } from "../adapters/index.js";
import { processProduct } from "../intelligence/index.js";

export async function scrapeStoreForQuery(storeName, searchQuery) {
  const adapter = getAdapter(storeName);
  const listings = await adapter(searchQuery);

  let saved = 0;

  for (const listing of listings) {
    const product = processProduct(listing, searchQuery, storeName);

    if (!product.accept) continue;

    const id = productId(storeName, product.url);

    await query(
      `INSERT INTO products (
        id,
        title,
        brand,
        model,
        category,
        specs,
        fingerprint,
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
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,NOW()
      )
      ON CONFLICT (id)
      DO UPDATE SET
        title=EXCLUDED.title,
        brand=EXCLUDED.brand,
        model=EXCLUDED.model,
        category=EXCLUDED.category,
        specs=EXCLUDED.specs,
        fingerprint=EXCLUDED.fingerprint,
        image=EXCLUDED.image,
        price=EXCLUDED.price,
        original_price=EXCLUDED.original_price,
        rating=EXCLUDED.rating,
        review_count=EXCLUDED.review_count,
        in_stock=EXCLUDED.in_stock,
        scraped_at=NOW()`,
      [
        id,
        product.title,
        product.brand,
        product.model,
        product.category,
        JSON.stringify(product.specs || {}),
        product.fingerprint,
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

    await query(
      `INSERT INTO price_history (product_id, price)
       VALUES ($1,$2)`,
      [id, product.price]
    );

    saved++;
  }

  return saved;
}

export async function scrapeAllStoresForQuery(searchQuery) {
  const { rows: stores } = await query(
    `SELECT name
     FROM stores
     WHERE enabled = true`
  );

  const results = await Promise.allSettled(
    stores.map(store => scrapeStoreForQuery(store.name, searchQuery))
  );

  return results;
}
