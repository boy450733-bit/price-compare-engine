export const priceOyeConfig = {
  name: "PriceOye",
  baseUrl: "https://priceoye.pk",
  searchUrl: (q) => `https://priceoye.pk/search?q=${encodeURIComponent(q)}`,
  selectors: {
    container: ".productBox",
    link: "a.product-card",
    linkAttr: "href",
    title: ".p-title",
    image: ".product-thumbnail",
    imageAttr: "src",
    price: ".price-box",
    originalPrice: ".price-diff-retail",
  },
};
