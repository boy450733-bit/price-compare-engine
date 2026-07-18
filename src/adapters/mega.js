import * as cheerio from "cheerio";

// Category-page based, not search-based — Mega.pk doesn't expose a
// confirmed keyword-search endpoint, but brand/category pages like this
// are real and stable. This adapter ignores the query text for now and
// returns everything in the Xiaomi mobiles category, so it's a
// placeholder to prove the pipeline end-to-end.
const SEARCH_URL = (q) => `https://www.mega.pk/search/${encodeURIComponent(q)}`;

export async function megaAdapter(query) {
  const res = await fetch(CATEGORY_URL, {
    headers: { "User-Agent": "PriceCompareBot/0.1 (+contact@yourdomain.com)" },
  });
  if (!res.ok) return [];

  const html = await res.text();
  const $ = cheerio.load(html);
  const results = [];

  // NOTE: verify these selectors against the real page — see Option 2
  // for how to find them accurately using your own browser.
  $("a[href*='mobiles_products']").each((_, el) => {
    const title = $(el).attr("title") || $(el).text().trim();
    const href = $(el).attr("href");
    if (!title || !href) return;

    results.push({
      title,
      url: href.startsWith("http") ? href : `https://www.mega.pk${href}`,
      image: null,
      price: null,
      originalPrice: null,
      rating: 0,
      reviewCount: 0,
      inStock: true,
    });
  });

  return results;
}
