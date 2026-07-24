export const iShoppingConfig = {
  name: "iShopping.pk",
  baseUrl: "https://www.ishopping.pk",
  searchUrl: (q) =>
    `https://www.ishopping.pk/catalogsearch/result/?q=${encodeURIComponent(q)}`,

  selectors: {
    container: ".product-items > li.item",
    title: "a.product-item-link",
    image: ".product-item-photo img",
    imageAttr: "src",
    price: ".product-item-details .price",
    originalPrice: null,
  },

  parsePrice: (text) => {
    const digits = text.replace(/[^\d]/g, "");
    return digits ? Number(digits) : null;
  },
};
