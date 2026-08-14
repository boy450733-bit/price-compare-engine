import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'node:path';
import { query } from "../db/client.js";
import { productId } from "../utils/hash.js";
import { getActiveAdapters } from "../adapters/stores/index.js";
import { processProduct } from "../intelligence/index.js";

// ============================================================================
// 1. ADVANCED SCRAPER RELIABILITY (ANTI-DETECTION ENGINE)
// ============================================================================

// Apply the stealth plugin to eliminate navigator.webdriver flags
puppeteer.use(StealthPlugin());

let sharedBrowser = null;

/**
 * Returns a singleton browser instance with persistent session storage.
 * This retains cookies, cache, and state across scrape tasks for free.
 */
export async function getSharedBrowser() {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    const userDataDir = path.resolve('.browser_session_data');

    sharedBrowser = await puppeteer.launch({
      headless: "new",
      userDataDir, // Stores cookies & cache so you appear as an existing visitor
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1366,768',
        '--lang=en-US,en;q=0.9',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
      ignoreHTTPSErrors: true,
      defaultViewport: {
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: true
      }
    });
  }
  return sharedBrowser;
}

/**
 * Adds human-like randomized delays to avoid triggering rate-limiting heuristics.
 */
export const randomDelay = (min = 1000, max = 2500) =>
  new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

/**
 * Executes a scrape task safely on a single IP without proxy costs.
 * -> IMPORT AND USE THIS INSIDE YOUR INDIVIDUAL STORE ADAPTERS <-
 */
export async function executeZeroCostScrape(targetUrl, scrapeLogicFn) {
  const browser = await getSharedBrowser();
  const page = await browser.newPage();

  try {
    // Set modern standard HTTP headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    });

    // Block non-critical tracking & image downloads to conserve your server's CPU & bandwidth
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      const url = req.url().toLowerCase();

      if (['media', 'font'].includes(resourceType) || url.includes('google-analytics') || url.includes('facebook')) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navigate to page
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Emulate light natural pause before attempting DOM extraction
    await randomDelay(800, 1800);
    
    // TEMPORARY DEBUG SCREENSHOT
    console.log(`📸 Taking debug screenshot of ${targetUrl}`);
    await page.screenshot({ path: 'debug-scrape.png', fullPage: false });
    // Run the extraction logic passed by your adapter
    const data = await scrapeLogicFn(page);
    return data;

  } catch (error) {
    console.error(`Scraper error on ${targetUrl}:`, error.message);
    return null;
  } finally {
    // Close only the tab to free memory; keep the browser profile running for the next job
    await page.close();
  }
}

/**
 * Optional cleanup function to call during server shutdown/SIGINT
 */
export async function closeSharedBrowser() {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}


// ============================================================================
// 2. DATA PIPELINE & DATABASE INSERTION LOGIC
// ============================================================================

export async function scrapeStoreForQuery(storeName, adapter, searchQuery) {
  // The adapter now internally uses executeZeroCostScrape() to return these listings
  const listings = await adapter(searchQuery);
  if (!listings || listings.length === 0) return 0;

  for (const listing of listings) {
    const product = processProduct(listing, searchQuery, storeName);
    if (!product.accepted) continue;

    const id = productId(storeName, product.url);

    await query(
      `INSERT INTO products (
        id, title, brand, model, category, normalized_title, specs, fingerprint, match_score,
        store, url, image, price, original_price, rating, review_count, in_stock, source_query, scraped_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        brand = EXCLUDED.brand,
        model = EXCLUDED.model,
        category = EXCLUDED.category,
        normalized_title = EXCLUDED.normalized_title,
        specs = EXCLUDED.specs,
        fingerprint = EXCLUDED.fingerprint,
        match_score = EXCLUDED.match_score,
        image = EXCLUDED.image,
        price = EXCLUDED.price,
        original_price = EXCLUDED.original_price,
        rating = EXCLUDED.rating,
        review_count = EXCLUDED.review_count,
        in_stock = EXCLUDED.in_stock,
        scraped_at = NOW()`,
      [
        id,
        product.title,
        product.brand,
        product.model,
        product.category,
        product.normalizedTitle,
        JSON.stringify(product.specs || {}),
        product.fingerprint,
        product.relevanceScore || 0,
        storeName,
        product.url,
        product.image,
        product.price,
        product.originalPrice,
        product.rating,
        product.reviewCount,
        product.inStock,
        searchQuery
      ]
    );

    // Optimized Price History Logic: Prevent duplicate history bloat
    const { rows: historyRows } = await query(
      `SELECT id, price FROM price_history 
       WHERE product_id = $1 
       ORDER BY recorded_at DESC LIMIT 1`,
      [id]
    );

    const lastEntry = historyRows[0];

    if (lastEntry && Number(lastEntry.price) === Number(product.price)) {
      // If price is identical to the latest record, just update its timestamp
      await query(
        `UPDATE price_history 
         SET recorded_at = NOW() 
         WHERE id = $1`,
        [lastEntry.id]
      );
    } else {
      // If price changed or no history exists, insert a new record
      await query(
        `INSERT INTO price_history (product_id, price, recorded_at) VALUES ($1, $2, NOW())`,
        [id, product.price]
      );
    }
  }

  return listings.length;
}

export async function scrapeAllStoresForQuery(searchQuery) {
  const activeAdapters = await getActiveAdapters();
  if (!activeAdapters || activeAdapters.length === 0) {
    console.warn("No active store adapters found in memory/database.");
    return [];
  }

  const results = await Promise.allSettled(
    activeAdapters.map(({ name, adapter }) => scrapeStoreForQuery(name, adapter, searchQuery))
  );

  return results;
}
