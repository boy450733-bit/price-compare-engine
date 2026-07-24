import { pool } from "../src/db/client.js";

// Run: npm run affiliate:add -- <productId> "<affiliateUrl>"
// Paste the tracked link Daraz's Adstream tool gave you after you
// manually submitted the product URL there.
const [productId, affiliateUrl] = process.argv.slice(2);

if (!productId || !affiliateUrl) {
  console.error('Usage: npm run affiliate:add -- <productId> "<affiliateUrl>"');
  process.exit(1);
}

async function main() {
  await pool.query(
    `INSERT INTO affiliate_links (product_id, affiliate_url)
     VALUES ($1, $2)
     ON CONFLICT (product_id) DO UPDATE SET affiliate_url = EXCLUDED.affiliate_url`,
    [productId, affiliateUrl]
  );
  console.log(`Saved affiliate link for product ${productId}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
