import * as cheerio from "cheerio";

const CATEGORY_URL =
  "https://www.mega.pk/search/Xiaomi%2BRedmi/";

export async function megaAdapter(query) {
  const res = await fetch(CATEGORY_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
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
