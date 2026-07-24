import * as cheerio from "cheerio";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Turns a small per-store config object into a working adapter function.
 * Supports two modes, auto-detected from the config shape:
 *
 * 1. HTML mode (most stores) — provide `selectors`. Fetches the page and
 *    parses it with Cheerio (see stores/_template.config.js).
 *
 * 2. JSON mode (SPA/API-backed stores, e.g. Daraz) — provide `parseJson`
 *    instead of `selectors`. Fetches the URL, parses the response as JSON,
 *    and calls your function to turn it into listings.
 *
 * Either mode also supports POST requests (needed for stores whose search
 * is an AJAX POST to a separate endpoint, e.g. WooCommerce sites using the
 * "Advanced Woo Search" plugin) via two optional config fields:
 *   method: "POST"
 *   body: (query) => string   — the raw request body (e.g. a
 *                                URLSearchParams(...).toString() for
 *                                form-encoded, or JSON.stringify(...) for
 *                                a JSON body)
 *   headers: { ... }          — extra headers, e.g. Content-Type, merged
 *                                with the default User-Agent
 */
export function createAdapter(config) {
  return config.parseJson ? createJsonAdapter(config) : createHtmlAdapter(config);
}

async function performFetch(config, query) {
  const {
    searchUrl,
    method = "GET",
    body,
    headers = {},
    userAgent = DEFAULT_USER_AGENT,
  } = config;

  const url = searchUrl(query);
  const fetchOptions = {
    method,
    headers: { "User-Agent": userAgent, ...headers },
  };

  if (method !== "GET" && body) {
    fetchOptions.body = typeof body === "function" ? body(query) : body;
  }

  return fetch(url, fetchOptions);
}

function createJsonAdapter(config) {
  const { parseJson } = config;

  return async function adapter(query) {
    const res = await performFetch(config, query);
    if (!res.ok) return [];

    const data = await res.json();
    return parseJson(data, query) || [];
  };
}

function createHtmlAdapter(config) {
  const {
    baseUrl,
    selectors: {
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
      // Counterpart to outOfStock for stores that only expose a positive
      // "this is buyable" signal (e.g. an "Add to cart" button) rather
      // than a negative "sold out" badge. Presence = in stock.
      inStockIndicator = null,
    },
    parsePrice = defaultParsePrice,
  } = config;

  return async function adapter(query) {
    const res = await performFetch(config, query);
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];

    $(container).each((_, el) => {
      const $el = $(el);

      const titleText = getFirstText($el, title);
      const href = getFirstAttrFromSelector($el, link, linkAttr);
      if (!titleText || !href) return;

      const imageSrc = image ? getFirstAttrValue($el.find(image), imageAttr) : null;

      // `price` may be a single selector or an ordered array of fallback
      // selectors (e.g. "discount price if present, else regular price").
      // Try each in order and use the first one that actually matches an
      // element on this card — a selector matching zero elements (like a
      // discount-only class on a non-discounted item) would otherwise
      // silently produce an empty price.
      let priceBox = getFirstMatching($el, price);
      let originalPriceText = "";

      if (originalPrice) {
        originalPriceText = $el.find(originalPrice).text().trim();
        priceBox = priceBox.clone();
        priceBox.find(originalPrice).remove();
      }

      const ratingValue = rating
        ? parseFloat($el.find(rating).text().match(/[\d.]+/)?.[0] || "0")
        : 0;

      const reviewCountValue = reviewCount
        ? parseInt($el.find(reviewCount).text().replace(/[^\d]/g, ""), 10) || 0
        : 0;

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
    });

    return results;
  };
}

// Selector fields (title, price, link, ...) may be a single CSS selector
// string or an array of fallback selectors tried in order — the first
// one that matches an element within $el wins.
function getFirstMatching($el, selectorOrArray) {
  const list = Array.isArray(selectorOrArray) ? selectorOrArray : [selectorOrArray];
  for (const sel of list) {
    const found = $el.find(sel);
    if (found.length) return found;
  }
  return $el.find(list[0]); // empty cheerio selection, handled by caller
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

function defaultParsePrice(text) {
  const cleaned = text.replace(/[^\d.]/g, "");
  return cleaned ? Number(cleaned) : null;
}
