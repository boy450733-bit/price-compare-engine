export const eezepcConfig = {
  name: "EzeePC",
  baseUrl: "https://eezepc.com",
  // dgwt_wcas=1 signals the "Advanced Woo Search" plugin's ajax search —
  // worth double-checking this returns the same results as a normal
  // on-site search, since some ajax-search plugins limit result count
  // or exclude out-of-stock items by default.
  searchUrl: (q) =>
    `https://eezepc.com/?s=${encodeURIComponent(q)}&post_type=product&dgwt_wcas=1`,

  selectors: {
    container: ".wd-product",
    title: ".wd-entities-title a",
    // `link` omitted — defaults to the same element as `title`, which is
    // correct here since your `url` selector pointed at the same link.
    image: ".product-image-link img",
    price: ".wrap-price .price",
    originalPrice: "del .amount",
    rating: ".rating",
    outOfStock: ".out-of-stock",
  },

  // TEMPORARY: strips everything except digits, same fix used for
  // iShopping's "Rs. 31,999" stray-period bug. Remove this override once
  // we confirm from real HTML whether EzeePC's price format actually has
  // decimals that matter — if it's always whole rupees, leave this as-is.
  parsePrice: (text) => {
    const digits = text.replace(/[^\d]/g, "");
    return digits ? Number(digits) : null;
  },
};
