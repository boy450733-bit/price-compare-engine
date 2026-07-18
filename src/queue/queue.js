import { Queue } from "bullmq";
import IORedis from "ioredis";
import "dotenv/config";

export const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const scrapeQueue = new Queue("scrape-query", { connection });

// Called by the search API when cache is thin/stale for a query.
// Deduplicated by jobId so the same query isn't queued twice in a row.
export async function enqueueScrape(searchQuery) {
  await scrapeQueue.add(
    "scrape",
    { query: searchQuery },
    { jobId: `scrape:${searchQuery}`, removeOnComplete: true, attempts: 2 }
  );
}
