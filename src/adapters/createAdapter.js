import * as cheerio from "cheerio";
import stringSimilarity from "string-similarity";
import crypto from "node:crypto";
// Import the Zero-Cost Stealth Scraper you built in scrape.js
import { executeZeroCostScrape } from "../scraper/scrape.js";

// --- STEP 1: Anti-Bot Evasion (Rotating User-Agents for standard JSON fetches) ---
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0"
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createAdapter(config) {
  return (config.parseJson || config.selectors?.isApi) ? createJsonAdapter(config) : createHtmlAdapter(config);
}

// -------------------------------------------------------------------------
// STANDARD FETCH (Used primarily for unprotected JSON API endpoints)
// -------------------------------------------------------------------------
async function performFetch(config, query) {
  const {
    searchUrl,
    search_url_template,
    method = "GET",
    body,
    headers = {},
  } = config;

  await sleep(Math.floor(Math.random() * 1500) + 500);

  const rawTemplate = searchUrl || search_url_template;
  const url = typeof rawTemplate === "function" ? rawTemplate(query) : rawTemplate.replace("{query}", encodeURIComponent(query));
  
  const fetchOptions = {
    method,
    headers: { 
      "User-Agent": getRandomUserAgent(), 
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "application/json,text/html,*/*;q=0.8",
      ...headers 
    },
  };

  if (method !== "GET" && body) {
    fetchOptions.body = typeof body === "function" ? body(query) : body;
  }

  try {
    return await fetch(url, fetchOptions);
  } catch (err) {
    throw new FetchError(`Failed to fetch ${url}: ${err.message}`, url, err);
  }
}

// -------------------------------------------------------------------------
// JSON ADAPTER (Uses Standard Fetch)
// -------------------------------------------------------------------------
function createJsonAdapter(config) {
  const { parseJson, parse_json: parseJsonCode, name, baseUrl, base_url } = config;
  const resolvedBaseUrl = baseUrl || base_url;
  
  let parseJsonFn = parseJson || parseJsonCode;
  if (typeof parseJsonFn === "string") {
    try {
      parseJsonFn = new Function("data", "query", parseJsonFn);
    } catch (err) {
      throw new Error(`Invalid parseJson function code: ${err.message}`);
    }
  }

  return async function adapter(query) {
    const res = await performFetch(config, query);
    if (!res.ok) {
      console.warn(`[adapter] ${name}: API returned ${res.status}`);
      return [];
    }
    
    try {
      const data = await res.json();

      if (typeof parseJsonFn === "function") {
        const results = parseJsonFn(data, query) || [];
        return (Array.isArray(results) ? results : []).map(p => formatProductRecord(p, name, resolvedBaseUrl));
      }

      const sel = config.selectors || {};
      const path = sel.dataPath || "mods.listItems";
      const items = path.split('.').reduce((obj, key) => obj?.[key], data) || [];

      return items
        .filter((item) => sel.filterType ? item.tItemType === sel.filterType : true)
        .map((item) => {
          const itemUrl = item[sel.fields?.url || "itemUrl"] || "";
          const formattedUrl = itemUrl.startsWith("http") ? itemUrl : `${resolvedBaseUrl || ''}${itemUrl}`;
          
          return {
            title: item[sel.fields?.title || "name"] || "Untitled Product",
            url: formattedUrl,
            image: item[sel.fields?.image || "image"] || null,
            price: item[sel.fields?.price || "price"] ? Number(item[sel.fields?.price || "price"]) : null,
            originalPrice: item[sel.fields?.originalPrice || "originalPrice"] ? Number(item[sel.fields?.originalPrice || "originalPrice"]) : null,
            rating: item[sel.fields?.rating || "ratingScore"] ? Number(item[sel.fields?.rating || "ratingScore"]) : 0,
            reviewCount: item[sel.fields?.reviewCount || "review"] ? Number(item[sel.fields?.reviewCount || "review"]) : 0,
            inStock: item[sel.fields?.inStock || "inStock"] !== false,
          };
        }).map(p => formatProductRecord(p, name, resolvedBaseUrl));
    } catch (err) {
      console.error(`[adapter] ${name}: JSON parsing failed: ${err.message}`);
      return [];
    }
  };
}

function formatProductRecord(p, storeName, baseUrl) {
  const rawId = `${storeName}|${p.url}`;
  const id = crypto.createHash("md5").update(rawId).digest("hex");
  let finalUrl = p.url;
  if (finalUrl && !finalUrl.startsWith("http") && baseUrl) {
    finalUrl = new URL(finalUrl, baseUrl).toString();
  }

  return {
    id,
    title: p.title,
    url: finalUrl,
    image: p.image || null,
    price: p.price !== undefined ? Number(p.price) : null,
    originalPrice: p.originalPrice !== undefined ? Number(p.originalPrice) : null,
    rating: p.rating !== undefined ? Number(p.rating) : 0,
    reviewCount: p.reviewCount !== undefined ? Number(p.reviewCount) : 0,
    inStock: p.inStock !== false,
    store: storeName,
    scraped_at: new Date(),
    details: p.details || "" // Pass details safely
  };
}

// -------------------------------------------------------------------------
// HTML ADAPTER (Hybrid Engine: Fast Fetch + Stealth Puppeteer Fallback)
// -------------------------------------------------------------------------
function createHtmlAdapter(config) {
  const {
    name,
    baseUrl: rawBaseUrl,
    base_url,
    searchUrl,
    search_url_template,
    selectors: selectorsData,
    parsePrice = defaultParsePrice,
  } = config;

  const baseUrl = rawBaseUrl || base_url;

  let selectors = selectorsData;
  if (typeof selectorsData === "string") {
    try {
      selectors = JSON.parse(selectorsData);
    } catch (err) {
      throw new Error(`Invalid selectors JSON for ${name}: ${err.message}`);
    }
  }

  const {
    container,
    title,
    link = title,
    linkAttr = "href",
    image,
    imageAttr = ["src", "data-src", "data-srcset"],
    price,
    originalPrice = null,
    rating = null,
    reviewCount = null,
    outOfStock = null,
    inStockIndicator = null,
    details = null, // Pulling from config
  } = selectors || {};

  return async function adapter(query) {
    const rawTemplate = searchUrl || search_url_template;
    const url = typeof rawTemplate === "function" ? rawTemplate(query) : rawTemplate.replace("{query}", encodeURIComponent(query));

    try {
      let html = "";
      
      // --- PHASE 1: The Fast Path (Standard Fetch + Cheerio) ---
      try {
        const res = await performFetch(config, query);
        if (res.ok) {
          const rawText = await res.text();
          
          // Anti-Bot Check: Make sure we didn't just download a Cloudflare Captcha page
          const isChallenge = rawText.length < 50000 && (
            rawText.toLowerCase().includes("cf-browser-verification") || 
            rawText.toLowerCase().includes("just a moment...") || 
            rawText.toLowerCase().includes("cloudflare") ||
            rawText.toLowerCase().includes("captcha")
          );
          
          if (!isChallenge && rawText.length > 5000) {
            html = rawText; // Success! We bypassed Puppeteer completely.
          }
        }
      } catch (fastErr) {
        // Fast path threw an error (e.g., TCP block). Silently fall through.
      }

      // --- PHASE 2: The Stealth Fallback (Puppeteer) ---
      if (!html) {
        console.debug(`[adapter] ${name}: Fast fetch blocked/failed. Engaging Stealth Puppeteer fallback...`);
        html = await executeZeroCostScrape(url, async (page) => {
          return await page.content(); 
        });
      }

      if (!html) {
        console.warn(`[adapter] ${name}: Both Fast and Stealth scrapes failed for ${url}`);
        return [];
      }

      // Pass the safely retrieved HTML (from either method) into existing Cheerio logic
      const $ = cheerio.load(html);
      const results = [];

      // JSON-LD Schema.org Extraction Fallback
      const jsonLdProducts = [];
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).html());
          const items = Array.isArray(json) ? json : [json];
          for (const item of items) {
            if (item["@type"] === "Product") jsonLdProducts.push(item);
            if (item["@graph"]) {
              const prod = item["@graph"].find(g => g["@type"] === "Product");
              if (prod) jsonLdProducts.push(prod);
            }
          }
        } catch (e) {}
      });

      $(container).each((index, el) => {
        try {
          const $el = $(el);

          let titleText = getFirstText($el, title);
          let href = getFirstAttrFromSelector($el, link, linkAttr);
          
          if (!titleText && jsonLdProducts[index]?.name) {
            titleText = jsonLdProducts[index].name;
          }
          if (!href && jsonLdProducts[index]?.url) {
            href = jsonLdProducts[index].url;
          }

          // Aggressively sanitize the title
          if (titleText) {
            titleText = titleText
              .replace(/<[^>]*>?/gm, '')
              .replace(/\s+/g, ' ')      
              .trim();
          }

          if (!titleText || !href) return;
          
          let imageSrc = null;
          if (image) {
            const { cleanSel, type, attr } = parsePseudoSelector(image);
            if (type === 'attr') {
              imageSrc = $el.find(cleanSel).attr(attr);
            } else {
              imageSrc = getFirstAttrValue($el.find(cleanSel), imageAttr);
            }
          }

          if (!imageSrc && jsonLdProducts[index]?.image) {
            const img = jsonLdProducts[index].image;
            imageSrc = Array.isArray(img) ? img[0] : (typeof img === 'string' ? img : img.url);
          }

          let priceBox = getFirstMatching($el, price);
          let originalPriceText = "";

          if (originalPrice) {
            originalPriceText = getFirstText($el, originalPrice);
            if (priceBox.length) {
              priceBox = priceBox.clone();
              priceBox.find(parsePseudoSelector(originalPrice).cleanSel).remove();
            }
          }

          let priceText = price && typeof price === 'string' && price.includes('::') 
            ? getFirstText($el, price) 
            : priceBox.text();

          let numericPrice = parsePrice(priceText);
          if ((!numericPrice || numericPrice === 0) && jsonLdProducts[index]?.offers) {
            const offer = Array.isArray(jsonLdProducts[index].offers) 
              ? jsonLdProducts[index].offers[0] 
              : jsonLdProducts[index].offers;
            if (offer?.price) numericPrice = Number(offer.price);
          }

          const ratingValue = rating
            ? parseFloat(getFirstText($el, rating).match(/[\d.]+/)?.[0] || "0")
            : (jsonLdProducts[index]?.aggregateRating?.ratingValue ? parseFloat(jsonLdProducts[index].aggregateRating.ratingValue) : 0);

          const reviewCountValue = reviewCount
            ? parseInt(getFirstText($el, reviewCount).replace(/[^\d]/g, ""), 10) || 0
            : (jsonLdProducts[index]?.aggregateRating?.reviewCount ? parseInt(jsonLdProducts[index].aggregateRating.reviewCount, 10) : 0);

          let inStockValue = true;
          if (outOfStock) {
            const oosSel = parsePseudoSelector(outOfStock).cleanSel;
            inStockValue = $el.find(oosSel).length === 0;
            if ($el.find(oosSel).length > 0) {
              console.debug(`[adapter] ${name}: "${titleText}" - OUT OF STOCK (found: ${outOfStock})`);
            }
          } else if (inStockIndicator) {
            const isSel = parsePseudoSelector(inStockIndicator).cleanSel;
            inStockValue = $el.find(isSel).length > 0;
            if ($el.find(isSel).length === 0) {
              console.debug(`[adapter] ${name}: "${titleText}" - OUT OF STOCK (missing: ${inStockIndicator})`);
            }
          } else if (jsonLdProducts[index]?.offers) {
            const offer = Array.isArray(jsonLdProducts[index].offers) ? jsonLdProducts[index].offers[0] : jsonLdProducts[index].offers;
            if (offer?.availability) {
              inStockValue = offer.availability.includes("InStock");
            }
          }

          // Safely define detailsText before it goes into the result object
          let detailsText = details ? getFirstText($el, details) : "";

          results.push(formatProductRecord({
            title: titleText,
            url: href.startsWith("http") ? href : `${baseUrl}${href}`,
            image: imageSrc || null,
            price: numericPrice,
            originalPrice: originalPriceText ? parsePrice(originalPriceText) : null,
            rating: ratingValue,
            reviewCount: reviewCountValue,
            inStock: inStockValue,
            details: detailsText, 
          }, name, baseUrl));
        } catch (rowErr) {
          console.debug(`[adapter] ${name}: Skipped malformed row: ${rowErr.message}`);
        }
      });

      return results;
    } catch (err) {
      console.error(`[adapter] ${name}: HTML parsing failed: ${err.message}`);
      return [];
    }
  };
}
// --- STEP 2.5: Advanced Pseudo-Selector Parser ---
function parsePseudoSelector(selector) {
  if (typeof selector !== "string") return { cleanSel: selector, type: 'node' };
  
  if (selector.includes('::text')) {
    return { cleanSel: selector.replace('::text', ''), type: 'text' };
  }
  
  const attrMatch = selector.match(/::attr\((.*?)\)/);
  if (attrMatch) {
    return { cleanSel: selector.replace(attrMatch[0], ''), type: 'attr', attr: attrMatch[1] };
  }
  
  return { cleanSel: selector, type: 'node' };
}

function getFirstMatching($el, selectorOrArray) {
  if (!selectorOrArray) return $el.find();
  const list = Array.isArray(selectorOrArray) ? selectorOrArray : [selectorOrArray];
  for (const sel of list) {
    const { cleanSel } = parsePseudoSelector(sel);
    const found = $el.find(cleanSel);
    if (found.length) return found;
  }
  const { cleanSel } = parsePseudoSelector(list[0]);
  return $el.find(cleanSel);
}

function getFirstText($el, selectorOrArray) {
  if (!selectorOrArray) return "";
  const list = Array.isArray(selectorOrArray) ? selectorOrArray : [selectorOrArray];
  for (const sel of list) {
    const { cleanSel, type, attr } = parsePseudoSelector(sel);
    const found = $el.find(cleanSel);
    if (found.length) {
      if (type === 'attr') return found.attr(attr) || "";
      return found.text().trim();
    }
  }
  return "";
}

function getFirstAttrFromSelector($el, selectorOrArray, fallbackAttr) {
  if (!selectorOrArray) return "";
  const list = Array.isArray(selectorOrArray) ? selectorOrArray : [selectorOrArray];
  for (const sel of list) {
    const { cleanSel, type, attr } = parsePseudoSelector(sel);
    const found = $el.find(cleanSel);
    if (found.length) {
      const finalAttr = type === 'attr' ? attr : fallbackAttr;
      return found.attr(finalAttr) || "";
    }
  }
  return "";
}

function getFirstAttrValue($el, attrs) {
  const list = Array.isArray(attrs) ? attrs : [attrs];
  for (const attr of list) {
    const val = $el.attr(attr);
    if (val) return val;
  }
  return null;
}

// --- STEP 3: Price Sanitization Engine ---
function defaultParsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^0-9.]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

// --- STEP 4: Fuzzy Matching Utility ---
export function findBestProductMatch(incomingTitle, existingProducts, threshold = 0.82) {
  if (!existingProducts || existingProducts.length === 0) return null;
  const titles = existingProducts.map(p => p.title);
  const match = stringSimilarity.findBestMatch(incomingTitle, titles);

  if (match.bestMatch.rating >= threshold) {
    return existingProducts[match.bestMatchIndex];
  }
  return null;
}

class FetchError extends Error {
  constructor(message, url, originalError) {
    super(message);
    this.name = "FetchError";
    this.url = url;
    this.originalError = originalError;
  }
}

export { FetchError };
