import express from "express";
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";

import { pool } from "./db/client.js";
import searchRoutes from "./routes/search.js";
import redirectRoutes from "./routes/redirect.js";

// Runs the schema and seeds stores automatically on startup.
// Safe to run on every deployment because schema.sql uses
// CREATE TABLE IF NOT EXISTS and store inserts use ON CONFLICT.
async function autoSetup() {
  // Run schema
  const schemaPath = path.resolve("src/db/schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  console.log("✅ Schema ready.");

  // Stores to seed
  const stores = [
    {
      name: "Mega.pk",
      color: "#0071dc",
      baseUrl: "https://www.mega.pk",
      searchUrl: "https://www.mega.pk/search/{query}",
      affiliate: null,
    },
    {
      name: "PriceOye.pk",
      color: "#0071cc",
      baseUrl: "https://priceoye.pk/",
      searchUrl: "https://priceoye.pk/search?q={query}",
      affiliate: null,
    },
  ];

  // Seed stores
  for (const store of stores) {
    await pool.query(
      `
      INSERT INTO stores
        (name, color, base_url, search_url_template, affiliate_param)
      VALUES
        ($1, $2, $3, $4, $5)
      ON CONFLICT (name)
      DO UPDATE SET
        color = EXCLUDED.color,
        base_url = EXCLUDED.base_url,
        search_url_template = EXCLUDED.search_url_template,
        affiliate_param = EXCLUDED.affiliate_param;
      `,
      [
        store.name,
        store.color,
        store.baseUrl,
        store.searchUrl,
        store.affiliate,
      ]
    );
  }

  console.log(`✅ Seeded ${stores.length} stores.`);
}

const app = express();

app.use(express.json());

app.use("/api", searchRoutes);
app.use("/", redirectRoutes);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await autoSetup();

    app.listen(PORT, () => {
      console.log(`🚀 API running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Startup failed:", err);
    process.exit(1);
  }
}

start();
