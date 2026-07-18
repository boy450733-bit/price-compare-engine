import express from "express";
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { pool } from "./db/client.js";
import { allStoreConfigs } from "./adapters/stores/index.js";
import searchRoutes from "./routes/search.js";
import redirectRoutes from "./routes/redirect.js";

async function autoSetup() {
  const schemaPath = path.resolve("src/db/schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  console.log("Schema ready.");

  for (const config of allStoreConfigs) {
    await pool.query(
      `INSERT INTO stores (name, color, base_url, search_url_template, affiliate_param)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (name) DO UPDATE SET
         color = EXCLUDED.color,
         base_url = EXCLUDED.base_url,
         search_url_template = EXCLUDED.search_url_template`,
      [
        config.name,
        config.color || "#666666",
        config.baseUrl,
        config.searchUrl("{query}"),
        config.affiliateParam || null,
      ]
    );
  }
  console.log(`Stores seeded: ${allStoreConfigs.map((c) => c.name).join(", ")}`);
}

const app = express();
app.use(express.json());

app.use("/api", searchRoutes);
app.use("/", redirectRoutes);

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;

autoSetup()
  .then(() => {
    app.listen(port, () => console.log(`API running on :${port}`));
  })
  .catch((err) => {
    console.error("Startup failed:", err.message);
    process.exit(1);
  });
