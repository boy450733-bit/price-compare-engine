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
import { renderPage } from "./utils/pageRenderer.js";
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
// Server-Side Rendered Routes (MUST BE BEFORE STATIC/PRETTYPAGES)
// --------------------------------------------------

const publicDir = path.resolve("public");



// Server-side injection for the deals page
app.get('/deals', async (req, res) => {
  await renderPage(req, res, {
    templateName: 'deals.html',
    routePath: '/deals',
    extraDataFn: async (req, dbPool) => {
      const settingResult = await dbPool.query('SELECT data FROM site_settings WHERE id = 1');
      const settings = settingResult.rows[0]?.data || {};
      return { colCount: Number(settings.dealsColCount) || 3 };
    }
  });
});

// Server-side injection for the home page
app.get(['/', '/index', '/index.html'], async (req, res) => {
  await renderPage(req, res, {
    templateName: 'index.html',
    routePath: '/',
    extraDataFn: async (req, dbPool) => {
      const [storesResult, topSearchesResult] = await Promise.all([
        dbPool.query('SELECT name, color, enabled FROM stores WHERE enabled = true'),
        dbPool.query('SELECT query FROM search_log GROUP BY query ORDER BY count(*) DESC LIMIT 5').catch(() => ({ rows: [] }))
      ]);

      const stores = storesResult.rows.length ? storesResult.rows : [
        { name: "PriceOye", color: "#0052CC", enabled: true },
        { name: "Daraz", color: "#F57224", enabled: true }
      ];

      const urlQuery = (req.query.q || "").trim();
      let initialQuery = urlQuery;
      if (!initialQuery) {
        const topQueries = topSearchesResult.rows.map(r => r.query);
        if (topQueries.length > 0) {
          // Pick a random query from the top results array
          const randomIndex = Math.floor(Math.random() * topQueries.length);
          initialQuery = topQueries[randomIndex];
        } else {
          initialQuery = ""; // Fallback if no search logs exist
        }
      }

      return {
        initialData: { stores, initialQuery }
      };
    }
  });
});

// Server-side pre-rendered route for individual product pages
app.get('/product', async (req, res) => {
  const productId = (req.query.id || "").trim();
  
  await renderPage(req, res, {
    templateName: 'product.html',
    routePath: '/product',
    extraDataFn: async (req, dbPool) => {
      let product = null;
      let history = [];

      if (productId) {
        try {
          const [productResult, historyResult] = await Promise.all([
            dbPool.query('SELECT * FROM products WHERE id = $1', [productId]),
            dbPool.query('SELECT id, product_id, price, recorded_at FROM price_history WHERE product_id = $1 ORDER BY recorded_at ASC', [productId])
          ]);

          product = productResult.rows[0] || null;
          history = historyResult.rows;
        } catch (err) {
          console.error("Error pre-rendering product server-side:", err);
        }
      }

      return {
        initialData: {
          product,
          history
        }
      };
    }
  });
});
// -------------------------------------------------
// Static assets & Pretty Pages (AFTER SSR ROUTES)
// --------------------------------------------------

app.use(prettyPages(publicDir));
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
