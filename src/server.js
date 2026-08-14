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
// Public directory & Server-Side Rendered Routes
// --------------------------------------------------

const publicDir = path.resolve("public");

// Server-side database theme & custom head injection for the deals page
app.get('/deals', async (req, res) => {
  try {
    const settingResult = await pool.query('SELECT data FROM site_settings WHERE id = 1');
    const settings = settingResult.rows[0]?.data || {};
    const theme = settings.theme || {};

    let html = fs.readFileSync(path.join(publicDir, 'deals.html'), 'utf8');

    const inlineCss = `
      :root {
        --color-bg: ${theme.colorBg || '#F7F5EF'};
        --color-surface: ${theme.colorSurface || '#FFFFFF'};
        --color-ink: ${theme.colorInk || '#17231D'};
        --color-ink-soft: ${theme.colorInkSoft || '#6B7A70'};
        --color-brand: ${theme.brandColor || '#050842'};
        --color-brand-dark: ${theme.brandDark || '#094F39'};
        --color-line: ${theme.colorLine || '#E7E1D2'};
        --color-accent: ${theme.accentColor || '#0905f5'};
        --color-danger: ${theme.colorDanger || '#C24B3F'};
        --font-body: "${theme.fontBody || 'Inter'}", sans-serif;
        --font-display: "${theme.fontDisplay || 'Space Grotesk'}", sans-serif;
        --deal-cols: ${settings.dealsColCount || 3};
      }
    `;

    html = html.replace('/* DB_THEME_INJECT */', inlineCss);
    html = html.replace('<!-- DB_CUSTOM_HEAD_INJECT -->', settings.customHead || '');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error("Deals page render error:", err);
    res.sendFile(path.join(publicDir, 'deals.html'));
  }
});


// Pretty URLs for remaining pages
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
  