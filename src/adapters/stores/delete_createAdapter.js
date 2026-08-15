import * as cheerio from "cheerio";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Creates an adapter function from a store config loaded from the database.
 * 
 * IMPORTANT: This function assumes the config has ALREADY been validated
 * by storeValidator.js during insertion/update. No validation happens here.
 * This keeps the runtime code fast and focused on scraping logic only.
 * 
 * Supports two modes:
 * 1. HTML mode: Uses Cheerio to parse HTML (most stores)
 * 2. JSON mode: Calls parseJson function to transform API responses
 */
export function createAdapter(config) {
  // Fast path: auto-detect mode
  return config.parseJson ? createJsonAdapter(config) : createHtmlAdapter(config);
}

/**
 * Performs the actual HTTP fetch with proper headers and method support.
 * Shared between HTML and JSON adapters.
 */
async function performFetch(config, query) {
  const {
    search_url_template: searchUrlTemplate,
    method = "GET",
    body,
    headers = {},
    user_agent: userAgent = DEFAULT_USER_AGENT,
  } = config;

  // Replace {query} placeholder in URL template
  const url = searchUrlTemplate.replace("{query}", encodeURIComponent(query));

  const fetchOptions = {
    method,
    headers: { "User-Agent": userAgent, ...headers },
  };

  // Add request body for POST/PUT
  if (method !== "GET" && body) {
    fetchOptions.body = typeof body === "function" ? body(query) : body;
  }

  try {
    return await fetch(url, fetchOptions);
  } catch (err) {
    throw new FetchError(`Failed to fetch ${url}: ${err.message}`, url, err);
  }
}

/**
 * JSON mode adapter — for SPA/API-backed stores (e.g. Daraz).
 * Calls the store's parseJson function to transform API response.
 */
function createJsonAdapter(config) {
  const { parseJson: parseJsonCode } = config;

  // Compile the parseJson function if it's a string
  let parseJsonFn = parseJsonCode;
  if (typeof parseJsonCode === "string") {
    try {
      // Create a function from string code
      parseJsonFn = new Function("data", "query", parseJsonCode);
    } catch (err) {
      throw new Error(`Invalid parseJson function code: ${err.message}`);
    }
  }

  return async function adapter(query) {
    const res = await performFetch(config, query);
    
    if (!res.ok) {
      console.warn(`[adapter] ${config.name}: API returned ${res.status} ${res.statusText}`);
      return [];
    }

    try {
      const data = await res.json();
      const results = parseJsonFn(data, query) || [];
      return Array.isArray(results) ? results : [];
    } catch (err) {
      console.error(`[adapter] ${config.name}: JSON parsing failed: ${err.message}`);
      return [];
    }
  };
}

/**
 * HTML mode adapter — for traditional HTML stores using CSS selectors.
 * Parses HTML with Cheerio and extracts product info via selectors.
 */
function createHtmlAdapter(config) {
  const {
    name: storeName,
    base_url: baseUrl,
    selectors: selectorsData,
    parsePrice = defaultParsePrice,
    timeout_ms: timeoutMs = 30000,
  } = config;

  // Parse selectors if stored as JSON string
  let selectors = selectorsData;
  if (typeof selectorsData === "string") {
    try {
      selectors = JSON.parse(selectorsData);
    } catch (err) {
      throw new Error(`Invalid selectors JSON for ${storeName}: ${err.message}`);
    }
  }

  const {
    container,
    title,
    link = title,
    linkAttr = "href",
    image,
    imageAttr = "src",
    price,
    originalPrice = null,
    rating = null,
    reviewCount = null,
    outOfStock = null,
    inStockIndicator = null,
  } = selectors;

  return async function adapter(query) {
    const res = await performFetch(config, query);

    if (!res.ok) {
      console.warn(`[adapter] ${storeName}: HTTP ${res.status} ${res.statusText}`);
      return [];
    }

    try {
      const html = await res.text();
      const $ = cheerio.load(html);
      const results = [];

      $(container).each((_, el) => {
        try {
          const $el = $(el);

          const titleText = getFirstText($el, title);
          const href = getFirstAttrFromSelector($el, link, linkAttr);

          // Skip invalid product rows
          if (!titleText || !href) return;

          const imageSrc = image ? getFirstAttrValue($el.find(image), imageAttr) : null;

          // Price: try selectors in order (first match wins)
          let priceBox = getFirstMatching($el, price);
          let originalPriceText = "";

          if (originalPrice) {
            originalPriceText = $el.find(originalPrice).text().trim();
            priceBox = priceBox.clone();
            priceBox.find(originalPrice).remove();
          }

          // Rating: extract number from text
          const ratingValue = rating
            ? parseFloat($el.find(rating).text().match(/[\d.]+/)?.[0] || "0")
            : 0;

          // Review count: extract only digits
          const reviewCountValue = reviewCount
            ? parseInt($el.find(reviewCount).text().replace(/[^\d]/g, ""), 10) || 0
            : 0;

          // Stock status: check for outOfStock badge OR presence of inStockIndicator
          let inStockValue = true;
          if (outOfStock) {
            inStockValue = $el.find(outOfStock).length === 0;
          } else if (inStockIndicator) {
            inStockValue = $el.find(inStockIndicator).length > 0;
          }

          results.push({
            title: titleText,
            url: href.startsWith("http") ? href : `${baseUrl}${href}`,
            image: imageSrc || null,
            price: parsePrice(priceBox.text()),
            originalPrice: originalPriceText ? parsePrice(originalPriceText) : null,
            rating: ratingValue,
            reviewCount: reviewCountValue,
            inStock: inStockValue,
          });
        } catch (rowErr) {
          // Skip rows with parse errors, log and continue
          console.debug(`[adapter] ${storeName}: Skipped malformed row: ${rowErr.message}`);
        }
      });

      return results;
    } catch (err) {
      console.error(`[adapter] ${storeName}: HTML parsing failed: ${err.message}`);
      return [];
    }
  };
}

/**
 * Find first matching element from a selector or array of selectors.
 * Returns empty Cheerio selection if none match.
 */
function getFirstMatching($el, selectorOrArray) {
  const list = Array.isArray(selectorOrArray) ? selectorOrArray : [selectorOrArray];
  for (const sel of list) {
    const found = $el.find(sel);
    if (found.length) return found;
  }
  // Return empty selection from first selector (graceful fallback)
  return $el.find(list[0]);
}

function getFirstText($el, selectorOrArray) {
  return getFirstMatching($el, selectorOrArray).text().trim();
}

function getFirstAttrFromSelector($el, selectorOrArray, attr) {
  return getFirstMatching($el, selectorOrArray).attr(attr);
}

function getFirstAttrValue($el, attrs) {
  const list = Array.isArray(attrs) ? attrs : [attrs];
  for (const attr of list) {
    const val = $el.attr(attr);
    if (val) return val;
  }
  return null;
}

/**
 * Default price parser: extract all digits and decimals, convert to number.
 * Handles: "Rs. 5,999.99" → 5999.99
 */
function defaultParsePrice(text) {
  const cleaned = text.replace(/[^\d.]/g, "");
  return cleaned ? Number(cleaned) : null;
}

/**
 * Custom error for fetch failures.
 */
class FetchError extends Error {
  constructor(message, url, originalError) {
    super(message);
    this.name = "FetchError";
    this.url = url;
    this.originalError = originalError;
  }
}

export { FetchError };
