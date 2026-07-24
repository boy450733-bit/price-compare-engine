export const flashiConfig = {
  name: "Flashi",
  baseUrl: "https://www.flashi.pk",
  searchUrl: (q) =>
    `https://flashi.pk/api/products?limit=500&q=${encodeURIComponent(q)}`,
  
  parseJson: (data) => {
    const items = data?.products || [];

    return items.map((item) => ({
      title: item.title,
      url: item.url,
      image: item.image || null,
      price: item.price != null ? Number(item.price) : null,
      originalPrice:
        item.originalPrice != null ? Number(item.originalPrice) : null,
      rating: item.rating != null ? Number(item.rating) : 0,
      reviewCount:
        item.reviewCount != null ? Number(item.reviewCount) : 0,
      inStock: item.inStock !== false,

      // Optional extra fields if your app uses them
      //id: item.id,
      //store: item.store,
      //storeColor: item.storeColor,
      //sourceQuery: item.sourceQuery,
      //scrapedAt: item.scrapedAt,
      //createdAt: item.createdAt,
    }));
  },
};
