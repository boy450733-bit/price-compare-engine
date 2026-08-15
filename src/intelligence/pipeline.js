// src/intelligence/pipeline.js

import { detectCategory } from "./category.js";
import { normalizeProduct } from "./normalizer.js";
import { extractSpecs } from "./specExtractor.js";
import { createFingerprint } from "./fingerprint.js";
import { calculateRelevance } from "./relevance.js";

export function processProduct(rawProduct, searchQuery) {
  const category = detectCategory(rawProduct.title);
  const normalized = normalizeProduct(rawProduct.title, category);
  const specs = extractSpecs(rawProduct.title);

  const product = {
    ...rawProduct,
    category,
    brand: normalized.brand,
    model: normalized.model,
    cleanedTitle: normalized.cleanedTitle,
    specs
  };

  // Generate the unified deduplication hash
  product.fingerprint = createFingerprint(product);

  const query = normalizeProduct(searchQuery, category);
  query.specs = extractSpecs(searchQuery);

  // Run through the strict scoring and negative keyword gating engine
  const relevance = calculateRelevance(query, product);

  product.relevance = relevance.score;
  product.relevanceScore = relevance.score;
  product.normalizedTitle = normalized.cleanedTitle;
  
  // CRITICAL: Ensure the scraper knows if this product failed the strict thresholds
  product.accepted = relevance.accepted;
  
  if (!product.accepted) {
    product.reason = "Failed strict relevance threshold or caught by negative accessory gating.";
  }

  return product;
}

export function processProducts(products, searchQuery, minScore = 0.5) {
  return products
    .map(product => processProduct(product, searchQuery))
    .filter(product => product.accepted) // Drops accessories and low-match garbage
    .sort((a, b) => b.relevance - a.relevance);
}
