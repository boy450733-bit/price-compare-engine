import { Queue } from "bullmq";
import IORedis from "ioredis";
import crypto from "node:crypto";
import "dotenv/config";

export const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const scrapeQueue = new Queue("scrape-query", { connection });

// Called by the search API when cache is thin/stale for a query.
// Deduplicated by jobId so the same query isn't queued twice in a row.
// BullMQ rejects custom job IDs containing ":" (Redis uses it as a key
// delimiter internally), so we hash the query into a plain hex string
// instead of embedding it with a colon prefix.
export async function enqueueScrape(searchQuery) {
  const jobId = "scrape-" + crypto.createHash("md5").update(searchQuery).digest("hex");
  await scrapeQueue.add(
    "scrape",
    { query: searchQuery },
    { jobId, removeOnComplete: true, attempts: 2 }
  );
}
