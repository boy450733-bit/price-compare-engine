import { Worker } from "bullmq";
import cron from "node-cron";
import { connection } from "./queue.js";
import { scrapeAllStoresForQuery } from "../scraper/scrape.js";
import { checkAndSendPriceAlerts } from "../utils/notifier.js";

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

// Schedule the price alert checker to run every 6 hours inside the worker service
cron.schedule("0 */6 * * *", () => {
  console.log("[worker] Cron triggered: Checking and sending price alerts...");
  checkAndSendPriceAlerts();
});

console.log("Scrape worker running...");
console.log("Price alert background cron worker scheduled in worker.js.");