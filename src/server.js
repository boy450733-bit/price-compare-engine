import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { pool } from "./db/client.js";
import { allStoreConfigs } from "./adapters/stores/index.js";
import { defaultSettings } from "./config/defaultSettings.js";
import searchRoutes from "./routes/search.js";
import redirectRoutes from "./routes/redirect.js";
import storesRoutes from "./routes/stores.js";
import adminRoutes from "./routes/admin.js";
import settingsRoutes from "./routes/settings.js";

// Runs the schema + seeds every store listed in
// src/adapters/stores/index.js automatically on boot. Safe to run every
// time the app starts: schema.sql uses CREATE TABLE IF NOT EXISTS, and
// the store insert uses ON CONFLICT, so re-running this on every deploy
// never duplicates or breaks anything. This removes the need to run
// `npm run migrate` / `npm run seed` manually from a console — and means
// adding a store to stores/index.js is the ONLY step needed to register it.
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

  // Only seeds if no row exists yet — never overwrites settings you've
  // already customized via the admin panel.
  await pool.query(
    `INSERT INTO site_settings (id, data) VALUES (1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(defaultSettings)]
  );
  console.log("Site settings ready.");
}

const app = express();
app.use(cors()); // still useful if you ever host the frontend separately later
app.use(express.json());
app.use(express.static("public")); // serves public/index.html at "/"

app.use("/api", searchRoutes);
app.use("/api", storesRoutes);
app.use("/api", settingsRoutes);
app.use("/admin/api", adminRoutes);
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
