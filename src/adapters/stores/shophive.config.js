export const shophiveConfig = {
  name: "Shophive",
  baseUrl: "https://www.shophive.com",
  searchUrl: (q) =>
    `https://www.shophive.com/magebig_ajaxsearch/ajax/index/?q=${encodeURIComponent(q)}`,

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
