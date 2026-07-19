export const flashiConfig = {
  name: "Flashi",
  baseUrl: "https://www.flashi.pk",
  searchUrl: (q) =>
    `https://flashi.pk/api/products?limit=500&q=${encodeURIComponent(q)}`,
  parseJson: (data) => {
    const items = data?.mods?.products || [];
    return items
  //    .filter((item) => item.tItemType === "nt_product")
      .map((item) => ({
        title: item.name,
        url: item.itemUrl?.startsWith("http") ? item.itemUrl : `https:${item.itemUrl}`,
        image: item.image || null,
        price: item.price ? Number(item.price) : null,
        originalPrice: item.originalPrice ? Number(item.originalPrice) : null,
        rating: item.ratingScore ? Number(item.ratingScore) : 0,
        reviewCount: item.review ? Number(item.review) : 0,
        inStock: item.inStock !== false,
      }));
  },
};
