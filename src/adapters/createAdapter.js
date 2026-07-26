import * as cheerio from "cheerio";
import stringSimilarity from "string-similarity";

// --- STEP 1: Anti-Bot Evasion (Rotating User-Agents) ---
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
  return config.parseJson ? createJsonAdapter(config) : createHtmlAdapter(config);
}

async function performFetch(config, query) {
  const {
    searchUrl,
    method = "GET",
    body,
    headers = {},
  } = config;

  // --- STEP 1: Human-like randomized delay (0.5s to 2s) to prevent WAF blocks ---
  await sleep(Math.floor(Math.random() * 1500) + 500);

  const url = searchUrl(query);
  const fetchOptions = {
    method,
    headers: { 
      "User-Agent": getRandomUserAgent(), 
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      ...headers 
    },
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
      imageAttr = ["src", "data-src", "data-srcset"],
      price,
      originalPrice = null,
      rating = null,
      reviewCount = null,
      outOfStock = null,
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

    // --- STEP 2: JSON-LD Schema.org Extraction Fallback ---
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
      const $el = $(el);

      let titleText = getFirstText($el, title);
      let href = getFirstAttrFromSelector($el, link, linkAttr);
      
      if (!titleText && jsonLdProducts[index]?.name) {
        titleText = jsonLdProducts[index].name;
      }
      if (!href && jsonLdProducts[index]?.url) {
        href = jsonLdProducts[index].url;
      }

      if (!titleText || !href) return;

      let imageSrc = image ? getFirstAttrValue($el.find(image), imageAttr) : null;
      if (!imageSrc && jsonLdProducts[index]?.image) {
        const img = jsonLdProducts[index].image;
        imageSrc = Array.isArray(img) ? img[0] : (typeof img === 'string' ? img : img.url);
      }

      let priceBox = getFirstMatching($el, price);
      let originalPriceText = "";

      if (originalPrice) {
        originalPriceText = $el.find(originalPrice).text().trim();
        if (priceBox.length) {
          priceBox = priceBox.clone();
          priceBox.find(originalPrice).remove();
        }
      }

      let numericPrice = parsePrice(priceBox.text());
      if ((!numericPrice || numericPrice === 0) && jsonLdProducts[index]?.offers) {
        const offer = Array.isArray(jsonLdProducts[index].offers) 
          ? jsonLdProducts[index].offers[0] 
          : jsonLdProducts[index].offers;
        if (offer?.price) numericPrice = Number(offer.price);
      }

      const ratingValue = rating
        ? parseFloat($el.find(rating).text().match(/[\d.]+/)?.[0] || "0")
        : (jsonLdProducts[index]?.aggregateRating?.ratingValue ? parseFloat(jsonLdProducts[index].aggregateRating.ratingValue) : 0);

      const reviewCountValue = reviewCount
        ? parseInt($el.find(reviewCount).text().replace(/[^\d]/g, ""), 10) || 0
        : (jsonLdProducts[index]?.aggregateRating?.reviewCount ? parseInt(jsonLdProducts[index].aggregateRating.reviewCount, 10) : 0);

      let inStockValue = true;
      if (outOfStock) {
        inStockValue = $el.find(outOfStock).length === 0;
      } else if (inStockIndicator) {
        inStockValue = $el.find(inStockIndicator).length > 0;
      } else if (jsonLdProducts[index]?.offers) {
        const offer = Array.isArray(jsonLdProducts[index].offers) ? jsonLdProducts[index].offers[0] : jsonLdProducts[index].offers;
        if (offer?.availability) {
          inStockValue = offer.availability.includes("InStock");
        }
      }

      results.push({
        title: titleText,
        url: href.startsWith("http") ? href : `${baseUrl}${href}`,
        image: imageSrc || null,
        price: numericPrice,
        originalPrice: originalPriceText ? parsePrice(originalPriceText) : null,
        rating: ratingValue,
        reviewCount: reviewCountValue,
        inStock: inStockValue,
      });
    });

    return results;
  };
}

function getFirstMatching($el, selectorOrArray) {
  if (!selectorOrArray) return $el.find();
  const list = Array.isArray(selectorOrArray) ? selectorOrArray : [selectorOrArray];
  for (const sel of list) {
    const found = $el.find(sel);
    if (found.length) return found;
  }
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
