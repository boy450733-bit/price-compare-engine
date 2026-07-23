// src/intelligence/relevance.js

const STOP_WORDS = new Set([
  "the","for","with","and","dual","sim","pta","official","new","latest",
  "mobile","phone","smartphone","edition","global","version","factory",
  "unlocked","kit","box","color","colour"
]);

function tokenize(text = "") {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => !STOP_WORDS.has(t));
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);

  let intersection = 0;
  for (const x of A) {
    if (B.has(x)) intersection++;
  }

  const union = new Set([...A, ...B]).size;
  return union ? intersection / union : 0;
}

function numberSimilarity(query, title) {
  const q = query.match(/\d+/g) || [];
  const t = title.match(/\d+/g) || [];

  if (!q.length) return 1;

  let matched = 0;

  for (const n of q) {
    if (t.includes(n)) matched++;
  }

  return matched / q.length;
}

function brandScore(queryBrand, productBrand) {
  if (!queryBrand) return 1;
  if (!productBrand) return 0.5;

  return queryBrand.toLowerCase() === productBrand.toLowerCase()
    ? 1
    : 0;
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

  const text = jaccard(queryTokens, titleTokens);
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

  const score =
    text * 0.45 +
    numbers * 0.25 +
    brand * 0.15 +
    specs * 0.15;

  return {
    score,
    accepted: score >= 0.1,
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
