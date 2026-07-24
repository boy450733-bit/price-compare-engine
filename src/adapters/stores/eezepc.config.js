export const eezepcConfig = {
  name: "EzeePC",
  baseUrl: "https://eezepc.com",
  searchUrl: (q) =>
    `https://eezepc.com/?s=${encodeURIComponent(q)}&post_type=product&dgwt_wcas=1`,

  // Confirmed via ReqBin: the exact same URL returns 403 on GET but 200
  // on POST (no body needed) — looks like a Cloudflare WAF rule targeting
  // GET specifically on this endpoint, not a cookie/JS-challenge issue.
  method: "POST",

  selectors: {
    container: ".wd-product",
    title: ".wd-entities-title a",
    image: ".product-image-link img",
    // WoodMart lazy-loads images — `src` holds a placeholder SVG until JS
    // runs. Try the common real-image attributes first, falling back to
    // `src` last so it degrades gracefully instead of erroring if none match.
    imageAttr: ["data-src", "data-lazy-src", "data-original", "src"],
    price: ".wrap-price .price",
    originalPrice: "del .amount",
    rating: ".rating",
    outOfStock: ".out-of-stock",
  },

  // TEMPORARY: strips everything except digits, same fix used for
  // iShopping's "Rs. 31,999" stray-period bug. Remove this override once
  // we confirm from real HTML whether EzeePC's price format actually has
  // decimals that matter.
  parsePrice: (text) => {
    const digits = text.replace(/[^\d]/g, "");
    return digits ? Number(digits) : null;
  },
};