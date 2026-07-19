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

      const titleText = $el.find(title).text().trim();
      const href = $el.find(link).attr(linkAttr);
      if (!titleText || !href) return;

      const imageSrc = image ? getFirstAttrValue($el.find(image), imageAttr) : null;

      let priceBox = $el.find(price);
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

      const inStockValue = outOfStock ? $el.find(outOfStock).length === 0 : true;

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
