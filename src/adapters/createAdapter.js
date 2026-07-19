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
    },
    userAgent = DEFAULT_USER_AGENT,
    parsePrice = defaultParsePrice,
  } = config;

  return async function adapter(query) {
    const url = searchUrl(query);
    const res = await fetch(url, {
    method: "post",
    headers: {
      "User-Agent": userAgent,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Referer": new URL(url).origin + "/",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Upgrade-Insecure-Requests": "1",
    },
    redirect: "follow",
  });
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

      results.push({
        title: titleText,
        url: href.startsWith("http") ? href : `${baseUrl}${href}`,
        image: imageSrc || null,
        price: parsePrice(priceBox.text()),
        originalPrice: originalPriceText ? parsePrice(originalPriceText) : null,
        rating: 0,
        reviewCount: 0,
        inStock: true,
      });
    });

    return results;
  };
}

function defaultParsePrice(text) {
  const cleaned = text.replace(/[^\d.]/g, "");
  return cleaned ? Number(cleaned) : null;
}
