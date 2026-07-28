import { Worker } from "bullmq";
import cron from "node-cron";
import { connection } from "./queue.js";
import { scrapeAllStoresForQuery } from "../scraper/scrape.js";
import { checkAndSendPriceAlerts } from "../utils/notifier.js";
import { pool } from "../db/client.js";

// Run this as a separate process: `npm run worker`
const worker = new Worker(
  "scrape-query",
  async (job) => {
    const { query } = job.data;
    console.log(`[worker] scraping all stores for: "${query}"`);
    const results = await scrapeAllStoresForQuery(query);
    console.log(`[worker] done: "${query}"`, results.map((r) => r.status));
  },
  { connection, concurrency: 3 } // limit concurrent scrape jobs
);

worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job.id} failed:`, err.message);
});

// Dynamic Cron Setup from Database Settings
async function initDynamicCron() {
  let defaultPattern = "0 */6 * * *"; // fallback
  
  try {
    const res = await pool.query("SELECT data FROM site_settings WHERE id = 1");
    const settings = res.rows[0]?.data || {};
    if (settings.alertsConfig?.cronSchedule) {
      defaultPattern = settings.alertsConfig.cronSchedule;
    }
  } catch (err) {
    console.error("[worker] Failed to load cron schedule from DB, using default:", err.message);
  }

  console.log(`[worker] Scheduling price alert cron with pattern: "${defaultPattern}"`);

  cron.schedule(defaultPattern, () => {
    console.log("[worker] Cron triggered: Checking and sending price alerts...");
    checkAndSendPriceAlerts();
  });
}

initDynamicCron();

console.log("Scrape worker running...");
