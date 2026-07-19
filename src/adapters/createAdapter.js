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
 *    and calls your function to turn it into listings. Use this whenever
 *    a store's search is powered by an internal API instead of server-
 *    rendered HTML (check DevTools Network tab — if you see a clean JSON
 *    response, always prefer this over trying to scrape HTML).
 */
export function createAdapter(config) {
  return config.parseJson ? createJsonAdapter(config) : createHtmlAdapter(config);
}

function createJsonAdapter(config) {
  const { searchUrl, parseJson, userAgent = DEFAULT_USER_AGENT } = config;

  return async function adapter(query) {
    const url = searchUrl(query);
    const res = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (!res.ok) return [];

    const data = await res.json();
    return parseJson(data, query) || [];
  };
}

function createHtmlAdapter(config) {
  const {
    baseUrl,
    searchUrl,
    selectors: {
      container,
      title,
      link = title,
      linkAttr = "href",
      image,
      imageAttr = "src",
      price,
      originalPrice = null,
      rating = null, // optional selector (relative to container) for a rating value/label
      reviewCount = null, // optional selector for a review count
      outOfStock = null, // optional selector whose mere PRESENCE (not its text) means the item is out of stock
    },
    userAgent = DEFAULT_USER_AGENT,
    parsePrice = defaultParsePrice,
  } = config;

  return async function adapter(query) {
    const url = searchUrl(query);
    const res = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];

    $(container).each((_, el) => {
      const $el = $(el);

      const titleText = $el.find(title).text().trim();
      const href = $el.find(link).attr(linkAttr);
      if (!titleText || !href) return;

      const imageSrc = image ? $el.find(image).attr(imageAttr) : null;

      let priceBox = $el.find(price);
      let originalPriceText = "";

      if (originalPrice) {
        originalPriceText = $el.find(originalPrice).text().trim();
        priceBox = priceBox.clone();
        priceBox.find(originalPrice).remove();
      }

      // Rating text often looks like "Rated 4.50 out of 5" — using the
      // first number MATCH (not a strip-and-concat of all digits) avoids
      // accidentally combining "4.50" and the "5" from "out of 5" into
      // a wrong value like 4.505.
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

function defaultParsePrice(text) {
  const cleaned = text.replace(/[^\d.]/g, "");
  return cleaned ? Number(cleaned) : null;
}
