import * as cheerio from "cheerio";

//const SEARCH_URL = (q) => `https://priceoye.pk/search?q=${encodeURIComponent(q)}`;
const SEARCH_URL = `https://priceoye.pk/search?q=Xiaomi+Redmi+14c`;

export async function priceOyeAdapter(query) {
  const res = await fetch(SEARCH_URL(query), {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!res.ok) return [];

  const html = await res.text();
  const $ = cheerio.load(html);
  
  console.log('scraped : ' + SEARCH_URL);
  
  const searchWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const results = [];

  // <-- Replace this selector with the product card selector
  $(".PRODUCT_CARD_SELECTOR").each((_, el) => {
    const product = $(el);

    // <-- Replace selectors below with PriceOye selectors
    const title = product.find("TITLE_SELECTOR").text().trim();

    if (!title) return;

    // Require EVERY search word to appear in the title
    const titleLower = title.toLowerCase();

    const matches = searchWords.every(word =>
      titleLower.includes(word)
    );

    if (!matches) return;

    const url = product.find("LINK_SELECTOR").attr("href");

    const image =
      product.find("IMG_SELECTOR").attr("src") ||
      product.find("IMG_SELECTOR").attr("data-src") ||
      product.find("IMG_SELECTOR").attr("data-lazy-src") ||
      null;

    const price = product.find("PRICE_SELECTOR").text().trim();

    const oldPrice = product.find("OLD_PRICE_SELECTOR").text().trim();

    results.push({
      title,
      url: url?.startsWith("http")
        ? url
        : `https://priceoye.pk${url}`,
      image,
      price: Number(price.replace(/[^\d]/g, "")) || null,
      originalPrice: Number(oldPrice.replace(/[^\d]/g, "")) || null,
      rating: 0,
      reviewCount: 0,
      inStock: true,
    });
  });

  return results;
}
