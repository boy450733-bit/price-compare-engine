import { pool } from "../src/db/client.js";

// Run: npm run affiliate:worklist
// Shows products that have been clicked but have no affiliate_links entry
// yet, sorted by click count — work top-down, highest-traffic products first.
async function main() {
  const { rows } = await pool.query(`
    SELECT p.id, p.title, p.store, p.url, COUNT(c.id) AS clicks
    FROM clicks c
    JOIN products p ON p.id = c.product_id
    LEFT JOIN affiliate_links al ON al.product_id = p.id
    WHERE al.product_id IS NULL
    GROUP BY p.id, p.title, p.store, p.url
    ORDER BY clicks DESC
    LIMIT 30
  `);

  if (rows.length === 0) {
    console.log("Nothing pending — every clicked product already has an affiliate link.");
  } else {
    console.log(`${rows.length} product(s) need a manually-converted affiliate link:\n`);
    for (const r of rows) {
      console.log(`[${r.clicks} clicks] ${r.store} — ${r.title}`);
      console.log(`  ${r.url}`);
      console.log(`  product id: ${r.id}\n`);
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
