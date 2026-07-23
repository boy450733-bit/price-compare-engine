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

  product.fingerprint = createFingerprint(product);

  const query = normalizeProduct(searchQuery, category);

  query.specs = extractSpecs(searchQuery);

  const relevance = calculateRelevance(query, product);
  // check 
  console.log("RELEVANCE OBJECT starts");
  console.log(JSON.stringify(relevance, null, 2));
  console.log("RELEVANCE OBJECT ends");
  
  product.relevance = relevance.score;
  product.accepted = relevance.accepted;

  return product;
}

export function processProducts(products, searchQuery, minScore = 0.1) {
  return products
    .map(product => processProduct(product, searchQuery))
    .filter(product => product.accepted)
    .sort((a, b) => b.relevance - a.relevance);
}
