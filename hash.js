// src/intelligence/normalizer.js

import { BRANDS_BY_CATEGORY } from "./brands.js";

function cleanSpaces(str = "") {
  return str.replace(/\s+/g, " ").trim();
}

function removeMarketingWords(text) {
  return text.replace(
    /\b(official|pta|approved|warranty|new|latest|brand new|global version|international version|dual sim|single sim|factory unlocked|original|sealed|box pack|with warranty|kit)\b/gi,
    " "
  );
}

function normalizeStorage(text) {
  return text
    .replace(/(\d+)\s*gb\s*ram/gi, "$1GB")
    .replace(/(\d+)\s*tb/gi, "$1TB")
    .replace(/(\d+)\s*gb/gi, "$1GB");
}

function detectBrand(title, category) {
  const lower = title.toLowerCase();

  // Check the detected category's own brand list first (category names
  // here are lowercase keys like "mobile"/"laptop", while detectCategory()
  // returns capitalized labels like "Mobile" — normalize before lookup).
  const categoryKey = category ? category.toLowerCase() : null;
  const priorityBrands = categoryKey ? BRANDS_BY_CATEGORY[categoryKey] : null;

  const brandLists = priorityBrands
    ? [priorityBrands, ...Object.values(BRANDS_BY_CATEGORY)]
    : Object.values(BRANDS_BY_CATEGORY);

  for (const brands of brandLists) {
    for (const brand of brands) {
      if (lower.includes(brand.toLowerCase())) {
        return brand;
      }
    }
  }

  return null;
}

function detectModel(title, brand) {
  if (!brand) return null;

  let model = title;

  const regex = new RegExp(brand, "i");
  model = model.replace(regex, "");

  model = model
    .replace(/\b\d+\s*GB\b/gi, "")
    .replace(/\b\d+\s*TB\b/gi, "")
    .replace(/\b\d+\s*MP\b/gi, "")
    .replace(/\b\d+\s*mAh\b/gi, "")
    .replace(/\b\d+\s*Hz\b/gi, "")
    .replace(/\b(black|white|blue|green|red|silver|gold|gray|grey|graphite|purple|pink)\b/gi, "");

  return cleanSpaces(model);
}

export function normalizeProduct(title, category = "Other") {
  let cleaned = title;

  cleaned = removeMarketingWords(cleaned);
  cleaned = normalizeStorage(cleaned);

  cleaned = cleaned
    .replace(/[()[\],]/g, " ")
    .replace(/\//g, " ")
    .replace(/-/g, " ");

  cleaned = cleanSpaces(cleaned);

  const brand = detectBrand(cleaned, category);
  // (category is used inside detectBrand to prioritize that category's
  // own brand list before falling back to the full set — see above)
  const model = detectModel(cleaned, brand);

  return {
    originalTitle: title,
    cleanedTitle: cleaned,
    brand,
    model
  };
}
