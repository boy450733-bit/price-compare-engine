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

    const baseUrl = settings.siteUrl || `${req.protocol}://${req.get('host')}`;
    const absoluteCanonical = new URL('/deals', baseUrl).href;

    // Clean up duplicate canonicals from customHead if present
    let customHeadContent = settings.customHead || '';
    customHeadContent = customHeadContent.replace(/<link[^>]*rel=["']canonical["'][^>]*>/gi, '');

    const rawLogo = String(settings.logoText || "Sasta.pk");
    const dot = rawLogo.indexOf(".");
    let logoName = dot > 0 ? rawLogo.slice(0, dot) : rawLogo;
    let logoTld = dot > 0 ? rawLogo.slice(dot) : "";
    const formattedLogoHtml = `${escapeHtml(logoName)}${logoTld ? `<span class="dot">${escapeHtml(logoTld)}</span>` : ""}`;
    const footerText = settings.footerText || "Powered by Sasta.pk Engine";

    // Pull database column count (defaults to 3)
    const dealCols = Number(settings.dealsColCount) || 3;

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
        --deal-cols: ${dealCols};
      }
    `;

    html = html.replace('/* DB_THEME_INJECT */', inlineCss);
    html = html.replace('<!-- DB_CUSTOM_HEAD_INJECT -->', customHeadContent);
    html = html.replace('href="/deals"', `href="${absoluteCanonical}"`);
    html = html.replace('<!-- DB_LOGO_INJECT -->', formattedLogoHtml);
    html = html.replace('<!-- DB_FOOTER_TEXT_INJECT -->', escapeHtml(footerText));

    // Optional: If you want the server to render the matching number of initial skeleton cards 
    // instead of a hardcoded 2 or 4, you can also inject them here based on dealCols!

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error("Deals page render error:", err);
    res.sendFile(path.join(publicDir, 'deals.html'));
  }
});
// Server-side database theme & custom head injection for the home page
app.get(['/', '/index', '/index.html'], async (req, res) => {
  try {
    // 1. Run the 3 required database queries concurrently
    const [settingsResult, storesResult, topSearchesResult] = await Promise.all([
      pool.query('SELECT data FROM site_settings WHERE id = 1'),
      pool.query('SELECT name, color, enabled FROM stores WHERE enabled = true'),
      pool.query('SELECT query FROM search_logs GROUP BY query ORDER BY count(*) DESC LIMIT 5')
    ]);

    const settings = settingsResult.rows[0]?.data || {};
    const theme = settings.theme || {};
    const stores = storesResult.rows.length ? storesResult.rows : [
      { name: "PriceOye", color: "#0052CC", enabled: true },
      { name: "Daraz", color: "#F57224", enabled: true }
    ];
    
    // Determine initial search query
    const urlQuery = (req.query.q || "").trim();
    let initialQuery = urlQuery;
    if (!initialQuery) {
      const topQueries = topSearchesResult.rows.map(r => r.query);
      initialQuery = topQueries.length > 0 ? topQueries[0] : "Xiaomi Redmi";
    }

    let html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

    // Build absolute canonical URL
    const baseUrl = settings.siteUrl || `${req.protocol}://${req.get('host')}`;
    const absoluteCanonical = new URL('/', baseUrl).href;

    // Format logo text with regex check and half-length fallback
    const rawLogoText = String(settings.logoText || "Sasta.pk");
    let namePart = rawLogoText;
    let tldPart = "";

    const domainRegex = /^[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$|^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/;
    if (domainRegex.test(rawLogoText)) {
      const firstDotIndex = rawLogoText.indexOf(".");
      namePart = rawLogoText.substring(0, firstDotIndex);
      tldPart = rawLogoText.substring(firstDotIndex);
    } else {
      const mid = Math.floor(rawLogoText.length / 2);
      namePart = rawLogoText.substring(0, mid);
      tldPart = rawLogoText.substring(mid);
    }

    const brandColor = theme.brandColor || "#0B6E4F";
    const accentColor = theme.accentColor || "#E8A33D";
    const formattedLogoHtml = `<span class="logo-name" style="color: ${brandColor};">${escapeHtml(namePart)}</span><span class="logo-tld" style="color: ${accentColor};">${escapeHtml(tldPart)}</span>`;

    const footerText = settings.footerText || "Powered by Sasta.pk Engine";
    const homeCols = Number(settings.homeColCount) || 3;

    const inlineCss = `
      :root {
        --color-bg: ${theme.colorBg || '#FAF7F0'};
        --color-surface: ${theme.colorSurface || '#FFFFFF'};
        --color-ink: ${theme.colorInk || '#17231D'};
        --color-ink-soft: ${theme.colorInkSoft || '#5B6B62'};
        --color-brand: ${brandColor};
        --color-brand-dark: ${theme.brandDark || '#094F39'};
        --color-line: ${theme.colorLine || '#E4DDCB'};
        --color-accent: ${accentColor};
        --color-danger: ${theme.colorDanger || '#C24B3F'};
        --font-body: "${theme.fontBody || 'Inter'}", sans-serif;
        --font-display: "${theme.fontDisplay || 'Space Grotesk'}", sans-serif;
        --home-cols: ${homeCols};
      }
    `;

    // Inject server-rendered configuration payload so client JS doesn't need fetch waterfalls for settings/stores
    const serverBootstrapScript = `
      <script>
        window.__INITIAL_DATA__ = {
          settings: ${JSON.stringify(settings)},
          stores: ${JSON.stringify(stores)},
          initialQuery: ${JSON.stringify(initialQuery)}
        };
      </script>
    `;

    html = html.replace('/* DB_THEME_INJECT */', inlineCss);
    html = html.replace('<!-- DB_CUSTOM_HEAD_INJECT -->', customHeadContent + serverBootstrapScript);
    html = html.replace('href="/"', `href="${absoluteCanonical}"`);
    html = html.replace('<!-- DB_LOGO_INJECT -->', formattedLogoHtml);
    html = html.replace('<!-- DB_FOOTER_TEXT_INJECT -->', escapeHtml(footerText));

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error("Home page render error:", err);
    res.sendFile(path.join(publicDir, 'index.html'));
  }
});

// Helper function for HTML escaping inside server.js
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
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
  