import * as cheerio from "cheerio";

// Category-page based, not search-based — Mega.pk doesn't expose a
// confirmed keyword-search endpoint, but brand/category pages like this
// are real and stable. This adapter ignores the query text for now and
// returns everything in the Xiaomi mobiles category, so it's a
// placeholder to prove the pipeline end-to-end.

const SEARCH_URL = (query)=>`https://www.mega.pk/search/${encodeURIComponent(query)}`;

export async function megaAdapter(query) {
  const res = await fetch(SEARCH_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      "sec-ch-ua-platform":"Windows",
    },
  });

  if (!res.ok) return [];

  const html = await res.text();
  const $ = cheerio.load(html);

  const results = [];

  $(".product-grid-div ul.item_grid > li").each((_, el) => {
    const product = $(el);

    const link = product.find("#lap_name_div h3 a");

    const title = link.text().trim();

    const url = link.attr("href");

    const image =
      product.find(".image img").attr("src") ||
      product.find(".image img").attr("data-src") ||
      null;

    const priceText = product
      .find(".cat_price")
      .clone()                // remove old price before reading current price
      .find(".was")
      .remove()
      .end()
      .text()
      .replace("- PKR", "")
      .replace(/,/g, "")
      .trim();

    const oldPriceText = product
      .find(".cat_price .was")
      .text()
      .replace("- PKR", "")
      .replace(/,/g, "")
      .trim();

    results.push({
      title,
      url,
      image,
      price: priceText ? Number(priceText) : null,
      originalPrice: oldPriceText ? Number(oldPriceText) : null,
      rating: 0,
      reviewCount: 0,
      inStock: true,
    });
  });

  return results;
}
