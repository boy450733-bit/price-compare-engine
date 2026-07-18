export const megaConfig = {
  name: "Mega.pk",
  baseUrl: "https://www.mega.pk",
  searchUrl: (q) =>
    `https://www.mega.pk/search/${encodeURIComponent(q.trim().split(/\s+/).join("+"))}/`,
  selectors: {
    container: ".lap_thu_box",
    title: "#lap_name_div h3 a",
    image: ".image img",
    price: ".cat_price",
    originalPrice: ".was",
  },
};
