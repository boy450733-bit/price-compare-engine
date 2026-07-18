import * as cheerio from "cheerio";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Turns a small per-store config object into a working adapter function.
 * This is the ONE place scraping/parsing logic lives — new stores should
 * never need to touch this file, only add a config (see stores/_template.config.js).
 */
export function createAdapter(config) {
  const {
    baseUrl, // REQUIRED e.g. "https://www.mega.pk"
    searchUrl, // REQUIRED (query) => full search URL string
    selectors: {
      container, // REQUIRED CSS selector for one product card
      title, // REQUIRED selector (relative to container) for the title text
      link = title, // selector (relative to container) holding the href — defaults to the title element
      linkAttr = "href",
      image, // selector (relative to container) for the product image, omit if none
      imageAttr = "src",
      price, // REQUIRED selector (relative to container) for the price text block
      originalPrice = null, // optional selector for a struck-through "was" price;
      // also gets stripped out of `price` text before parsing, since sites
      // often nest the old price inside the same price block
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
