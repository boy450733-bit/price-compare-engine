import * as cheerio from "cheerio";

const SEARCH_URL = (q) => `https://www.mega.pk/search.php?query=${encodeURIComponent(q)}`;

// This is a TEMPLATE — verify the actual selectors against the live site
// (they change; check DevTools before relying on this). Prefer JSON-LD
// (script[type="application/ld+json"]) or a site search API if one exists
// before falling back to raw HTML selectors like this.
export async function megaAdapter(query) {
  const res = await fetch(SEARCH_URL(query), {
    headers: { "User-Agent": "PriceCompareBot/0.1 (+contact@yourdomain.com)" },
  });
  if (!res.ok) return [];

  const html = await res.text();
  const $ = cheerio.load(html);
  const results = [];

  $(".product-item").each((_, el) => {
    const title = $(el).find(".product-title").text().trim();
    const url = $(el).find("a").attr("href");
    const image = $(el).find("img").attr("src");
    const priceText = $(el).find(".price").text().replace(/[^\d.]/g, "");

    if (!title || !url) return;

    results.push({
      title,
      url: url.startsWith("http") ? url : `https://www.mega.pk${url}`,
      image,
      price: priceText ? Number(priceText) : null,
      originalPrice: null,
      rating: 0,
      reviewCount: 0,
      inStock: true,
    });
  });

  return results;
}
