import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";

import { pool } from "./db/client.js";
import { defaultSettings } from "./config/defaultSettings.js";

import searchRoutes from "./routes/search.js";
import redirectRoutes from "./routes/redirect.js";
import storesRoutes from "./routes/stores.js";
import adminRoutes from "./routes/admin.js";
import settingsRoutes from "./routes/settings.js";
import historyRoutes from "./routes/history.js";
import alertsRoutes from "./routes/alerts.js";

import { prettyPages } from "./utils/prettyPages.js";


async function autoSetup() {
  const schemaPath = path.resolve("src/db/schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");

  await pool.query(sql);
  console.log("Schema ready.");

  await pool.query(
    `INSERT INTO site_settings (id, data)
     VALUES (1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(defaultSettings)]
  );

  console.log("Site settings ready.");
}


const app = express();


// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(express.json());
app.use(cookieParser());


// --------------------------------------------------
// Public directory
// --------------------------------------------------

const publicDir = path.resolve("public");


// Pretty URLs
// /products     -> /public/products.html
// /deals        -> /public/deals.html
// /stores       -> /public/stores.html
// /about        -> /public/about.html
// etc.
app.use(prettyPages(publicDir));


// Static assets
app.use(express.static(publicDir));


// --------------------------------------------------
// API routes
// --------------------------------------------------

app.use("/api", searchRoutes);
app.use("/api", storesRoutes);
app.use("/api", settingsRoutes);
app.use("/api", historyRoutes);
app.use("/api", alertsRoutes);

app.use("/admin/api", adminRoutes);
app.use("/admin/api", alertsRoutes);


// --------------------------------------------------
// Other routes
// --------------------------------------------------

app.use("/", redirectRoutes);


// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});


// --------------------------------------------------
// Start server
// --------------------------------------------------

const port = process.env.PORT || 3000;

autoSetup()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server running on :${port}`);
    });
  })
  .catch((err) => {
    console.error("Startup failed:", err.message);
    process.exit(1);
  });
  