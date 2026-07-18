import { pool } from "../src/db/client.js";

const stores = [
  {
    name: "Mega.pk",
    color: "#0071dc",
    base_url: "https://www.mega.pk",
    search_url_template: "https://www.mega.pk/search.php?query={query}",
    affiliate_param: null, // fill in once you have a partner/affiliate id
  },
  // Add Daraz, PriceOye, Telemart, etc. here as you build their adapters.
];

async function main() {
  for (const s of stores) {
    await pool.query(
      `INSERT INTO stores (name, color, base_url, search_url_template, affiliate_param)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (name) DO UPDATE SET
         color = EXCLUDED.color,
         base_url = EXCLUDED.base_url,
         search_url_template = EXCLUDED.search_url_template`,
      [s.name, s.color, s.base_url, s.search_url_template, s.affiliate_param]
    );
  }
  console.log(`Seeded ${stores.length} store(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
