import * as cheerio from "cheerio";

// Confirmed real search pattern: words joined with "+", trailing slash.
// e.g. https://www.mega.pk/search/Xiaomi+Redmi+15c/
const SEARCH_URL = (q) =>
  `https://www.mega.pk/search/${encodeURIComponent(q.trim().split(/\s+/).join("+"))}/`;

// Selectors verified against real page markup (2026-07):
// container: li.col-xs-6 > div.lap_thu_box
// title+url: #lap_name_div h3 a
// image: .image img[src]
// price: .cat_price (strip the nested .was element, which holds the
//        pre-discount price, before parsing the current price)
export async function megaAdapter(query) {
  const res = await fetch(SEARCH_URL(query), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });
  if (!res.ok) return [];

  const html = await res.text();
  const $ = cheerio.load(html);
  const results = [];

  $(".lap_thu_box").each((_, el) => {
    const $el = $(el);
    const titleLink = $el.find("#lap_name_div h3 a");
    const title = titleLink.text().trim();
    const url = titleLink.attr("href");
    const image = $el.find(".image img").attr("src");

    const priceBox = $el.find(".cat_price");
    const wasText = priceBox.find(".was").text().trim();

    const priceBoxClone = priceBox.clone();
    priceBoxClone.find(".was").remove();
    const priceText = priceBoxClone.text().replace(/[^\d.]/g, "");
    const originalPriceText = wasText.replace(/[^\d.]/g, "");

    if (!title || !url) return;

    results.push({
      title,
      url: url.startsWith("http") ? url : `https://www.mega.pk${url}`,
      image,
      price: priceText ? Number(priceText) : null,
      originalPrice: originalPriceText ? Number(originalPriceText) : null,
      rating: 0,
      reviewCount: 0,
      inStock: true,
    });
  });

  return results;
}
