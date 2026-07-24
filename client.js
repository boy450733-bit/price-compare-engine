// src/intelligence/index.js

export * from "./brands.js";
export * from "./category.js";
export * from "./fingerprint.js";
export * from "./normalizer.js";
export * from "./pipeline.js";
export * from "./relevance.js";
export * from "./specExtractor.js";
/*
export function processProduct(listing, searchQuery, storeName) {
  return {
    ...listing,

    accept: true,

    brand: "TEST_BRAND",
    model: "TEST_MODEL",
    category: "mobile",

    specs: {
      ram: "8GB",
      storage: "256GB",
      color: "Black"
    },

    fingerprint: `test-${storeName}-${Date.now()}`
  };
}
*/
