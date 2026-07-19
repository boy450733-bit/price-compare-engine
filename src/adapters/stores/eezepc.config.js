export const eezepcConfig = {
  name: "EzeePC",
  baseUrl: "https://eezepc.com",
  searchUrl: (q) =>
    `https://eezepc.com/?s=${encodeURIComponent(q)}&post_type=product&dgwt_wcas=1`,

  selectors: {
    container: ".wd-product",
    title: ".wd-entities-title a",
    url: ".wd-entities-title a",
    image: ".product-image-link img",
    price: ".wrap-price .price",
    originalPrice: "del .amount",
    rating: ".rating",
    outOfStock: ".out-of-stock",
  },
};
