import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import AmpOptimizer from "@ampproject/toolbox-optimizer";

import { pool } from "./db/client.js";
import { defaultSettings } from "./config/defaultSettings.js";

import searchRoutes from "./routes/search.js";
import redirectRoutes from "./routes/redirect.js";
import storesRoutes from "./routes/stores.js";
import adminRoutes from "./routes/admin.js";
import settingsRoutes from "./routes/settings.js";
import historyRoutes from "./routes/history.js";
import alertsRoutes from "./routes/alerts.js";

import { checkAndSendPriceAlerts } from "./utils/notifier.js";
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
// AMP Optimizer Setup
// --------------------------------------------------
const ampOptimizer = AmpOptimizer.create({
  lts: true,
  minify: true
});

async function serveOptimizedPage(req, res, filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Page not found');
    }
    const rawHtml = fs.readFileSync(filePath, 'utf8');
    const optimizedHtml = await ampOptimizer.transformHtml(rawHtml);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(optimizedHtml);
  } catch (err) {
    console.error('AMP Optimization error:', err);
    // Fallback to serving raw file if optimization encounters a runtime exception
    res.sendFile(filePath);
  }
}

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
// Public directory & Optimized Views
// --------------------------------------------------

const publicDir = path.resolve("public");

// Intercept core HTML pages for server-side optimization
app.get(['/', '/index'], (req, res) => {
  serveOptimizedPage(req, res, path.join(publicDir, 'index.html'));
});

app.get(['/product', '/product.html'], (req, res) => {
  serveOptimizedPage(req, res, path.join(publicDir, 'product.html'));
});

app.get(['/deals', '/deals.html'], (req, res) => {
  serveOptimizedPage(req, res, path.join(publicDir, 'deals.html'));
});

// Pretty URLs for remaining pages (stores, about, etc.)
app.use(prettyPages(publicDir));

// Static assets (CSS, JS, images)
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
  