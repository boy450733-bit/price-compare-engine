export const darazConfig = {
  name: "Daraz",
  baseUrl: "https://www.daraz.pk",
  searchUrl: (q) =>
    `https://www.daraz.pk/catalog/?ajax=true&isFirstRequest=true&page=1&q=${encodeURIComponent(q)}`,
  parseJson: (data) => {
    const items = data?.mods?.listItems || [];
    return items
      .filter((item) => item.tItemType === "nt_product")
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
