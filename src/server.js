import express from "express";
import cors from "cors";
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
import cron from "node-cron";
import { checkAndSendPriceAlerts } from "./utils/notifier.js";

// Import store configs individually for initial database seeding
import { megaConfig } from "./adapters/stores/mega.config.js";
import { priceOyeConfig } from "./adapters/stores/priceoye.config.js";
import { iShoppingConfig } from "./adapters/stores/ishopping.config.js";
import { darazConfig } from "./adapters/stores/daraz.config.js";
import { eezepcConfig } from "./adapters/stores/eezepc.config.js";
import { shophiveConfig } from "./adapters/stores/shophive.config.js";
import { flashiConfig } from "./adapters/stores/flashi.config.js";

const initialStoreConfigs = [
  megaConfig,
  priceOyeConfig,
  iShoppingConfig,
  darazConfig,
  eezepcConfig,
  shophiveConfig,
  flashiConfig,
];

async function autoSetup() {
  const schemaPath = path.resolve("src/db/schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  console.log("Schema ready.");
  const getRandomColor = () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

  for (const config of initialStoreConfigs) {
    await pool.query(
      `INSERT INTO stores (name, color, base_url, search_url_template, affiliate_param, selectors)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT (name) DO UPDATE SET
          color = COALESCE(stores.color, EXCLUDED.color),
          base_url = COALESCE(stores.base_url, EXCLUDED.base_url),
          search_url_template = COALESCE(stores.search_url_template, EXCLUDED.search_url_template),
          selectors = COALESCE(stores.selectors, EXCLUDED.selectors),
          affiliate_param = COALESCE(stores.affiliate_param, EXCLUDED.affiliate_param)`,
      [
        config.name,
        config.color || getRandomColor(),
        config.baseUrl,
        config.searchUrl("{query}"),
        config.affiliateParam || null,
        config.selectors ? JSON.stringify(config.selectors) : null,
      ]
    );
  }
  console.log(`Stores seeded: ${initialStoreConfigs.map((c) => c.name).join(", ")}`);

  await pool.query(
    `INSERT INTO site_settings (id, data) VALUES (1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(defaultSettings)]
  );
  console.log("Site settings ready.");
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.use("/api", searchRoutes);
app.use("/api", storesRoutes);
app.use("/api", settingsRoutes);
app.use("/admin/api", adminRoutes);
app.use("/api", historyRoutes);
app.use("/api", alertsRoutes);
app.use("/admin/api", alertsRoutes);
app.use("/", redirectRoutes);

app.post("/admin/api/trigger-alerts", async (_req, res) => {
  try {
    await checkAndSendPriceAlerts();
    res.json({ success: true, message: "Price alerts check triggered manually." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;

autoSetup()
  .then(() => {
    app.listen(port, () => {
      console.log(`API running on :${port}`);

      cron.schedule("0 */6 * * *", () => {
        checkAndSendPriceAlerts();
      });
      console.log("Price alert background cron worker scheduled.");
    });
  })
  .catch((err) => {
    console.error("Startup failed:", err.message);
    process.exit(1);
  });
  