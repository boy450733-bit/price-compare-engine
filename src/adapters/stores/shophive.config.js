export const shophiveConfig = {
  name: "Shophive",
  baseUrl: "https://www.shophive.com",
  searchUrl: (q) =>
    `https://www.shophive.com/catalogsearch/result/index/?p=2&q=${encodeURIComponent(q)}`,

    // Confirmed via ReqBin: the exact same URL returns 403 on GET but 200
  // on POST (no body needed) — looks like a Cloudflare WAF rule targeting
  // GET specifically on this endpoint, not a cookie/JS-challenge issue.
  //method: "POST",
  selectors: {
    container: "li.product-item",

    // Product URL
    link: "h2.product-item-name a.product-item-link",
    linkAttr: "href",

    // Product Title
    title: "h2.product-item-name a.product-item-link",

    // Product Image
    image: "img.product-image-photo",
    imageAttr: "src",

    // Current Price
    price: ".special-price .price",

    // Original Price (if available)
    originalPrice: ".old-price .price",

    // Optional fields
    inStock: ".action.tocart",
    rating: ".rating-result",
  },
};
