import express from "express";
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { pool } from "./db/client.js";
import searchRoutes from "./routes/search.js";
import redirectRoutes from "./routes/redirect.js";

// Runs the schema + seeds the initial store list automatically on boot.
// Safe to run every time the app starts: schema.sql uses
// CREATE TABLE IF NOT EXISTS, and the store insert uses ON CONFLICT,
// so re-running this on every deploy never duplicates or breaks anything.
// This removes the need to run `npm run migrate` / `npm run seed`
// manually from a console.
async function autoSetup() {
  const schemaPath = path.resolve("src/db/schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  console.log("Schema ready.");

  await pool.query(
    `INSERT INTO stores (name, color, base_url, search_url_template, affiliate_param)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (name) DO UPDATE SET
       color = EXCLUDED.color,
       base_url = EXCLUDED.base_url,
       search_url_template = EXCLUDED.search_url_template`,
    [
      "Mega.pk",
      "#0071dc",
      "https://www.mega.pk",
      "https://www.mega.pk/search/{query}",
      null,
    ]
  );
  console.log("Stores seeded.");
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
