// src/intelligence/relevance.js

// Keep the strict threshold to prevent accessories, but the new text logic will easily pass core products
export const MIN_ACCEPT_SCORE = 0.60;

const STOP_WORDS = new Set([
  "the","for","with","and","dual","sim","pta","official","new","latest",
  "mobile","phone","smartphone","edition","global","version","factory",
  "unlocked","kit","box","color","colour"
]);

// Negative keywords to prevent matching core products with their accessories
const ACCESSORY_KEYWORDS = new Set([
  "cover", "case", "cable", "protector", "strap", "glass", "pouch", 
  "charger", "adapter", "wall", "handsfree", "earbuds", "earphones", "wcp02"
]);

function tokenize(text = "") {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => !STOP_WORDS.has(t));
}

function isAccessory(text = "") {
  const tokens = tokenize(text);
  return tokens.some(t => ACCESSORY_KEYWORDS.has(t));
}

// --- UPGRADED: Subset Overlap Match ---
// Replaces Jaccard to prevent short queries from being penalized by long merchant titles
function textSimilarity(queryTokens, titleTokens) {
  if (!queryTokens.length) return 1; // Give full credit if no text to compare

  let matched = 0;
  for (const q of queryTokens) {
    // Match if the query token is an exact match OR a substring 
    // (e.g. query "reno" matches title token "reno13")
    if (titleTokens.some(t => t === q || t.includes(q) || q.includes(t))) {
      matched++;
    }
  }

  // Divide by query length, NOT union. If all query words are in the title, it's 100% (1.0)
  return matched / queryTokens.length;
}

function numberSimilarity(query, title) {
  const q = query.match(/\d+/g) || [];
  const t = title.match(/\d+/g) || [];

  if (!q.length) return 1;

  let matched = 0;
  for (const n of q) {
    if (t.includes(n) || title.includes(n)) matched++;
  }

  return matched / q.length;
}

function brandScore(queryBrand, productBrand) {
  if (!queryBrand) return 1;
  if (!productBrand) return 0.5;

  return queryBrand.toLowerCase() === productBrand.toLowerCase() ? 1 : 0;
}

function specScore(querySpecs = {}, productSpecs = {}) {
  let total = 0;
  let matched = 0;

  for (const key of Object.keys(querySpecs)) {
    total++;
    if (!productSpecs[key]) continue;

    if (
      String(querySpecs[key]).toLowerCase() ===
      String(productSpecs[key]).toLowerCase()
    ) {
      matched++;
    }
  }

  return total ? matched / total : 1;
}

export function calculateRelevance(queryInfo, productInfo) {
  const queryTokens = tokenize(queryInfo.cleanedTitle);
  const titleTokens = tokenize(productInfo.cleanedTitle);

  const text = textSimilarity(queryTokens, titleTokens);
  const numbers = numberSimilarity(
    queryInfo.cleanedTitle,
    productInfo.cleanedTitle
  );
  const brand = brandScore(
    queryInfo.brand,
    productInfo.brand
  );
  const specs = specScore(
    queryInfo.specs,
    productInfo.specs
  );

  let score =
    text * 0.45 +
    numbers * 0.25 +
    brand * 0.15 +
    specs * 0.15;

  // --- ACCESSORY GATING ---
  const queryIsAccessory = isAccessory(queryInfo.cleanedTitle);
  const productIsAccessory = isAccessory(productInfo.cleanedTitle);

  // If the search was NOT for an accessory, but the product IS an accessory, heavily penalize it
  if (!queryIsAccessory && productIsAccessory) {
    score *= 0.1; 
  }

  return {
    score,
    accepted: score >= MIN_ACCEPT_SCORE,
    breakdown: {
      text,
      numbers,
      brand,
      specs
    }
  };
}

export function sortByRelevance(products) {
  return [...products].sort((a, b) => b.score - a.score);
}
