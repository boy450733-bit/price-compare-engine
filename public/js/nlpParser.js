// public/js/nlpParser.js

function parseNaturalQuery(rawQuery) {
  let query = rawQuery.toLowerCase();
  
  const extracted = {
    keyword: rawQuery,
    brand: null,
    maxPrice: null,
    ram: null,
    rom: null
  };

  // 1. Extract Known Brands
  const knownBrands = ["xiaomi", "redmi", "samsung", "infinix", "tecno", "realme", "oppo", "vivo", "apple", "iphone"];
  for (const b of knownBrands) {
    if (query.includes(b)) {
      extracted.brand = b.charAt(0).toUpperCase() + b.slice(1);
      break;
    }
  }

  // 2. Extract Max Price (e.g., "under 60k", "below 50000")
  const priceRegex = /(?:under|below|upto|less than)\s*(?:rs\.?)?\s*(\d+)(k)?/i;
  const priceMatch = query.match(priceRegex);
  if (priceMatch) {
    let amount = parseInt(priceMatch[1], 10);
    if (priceMatch[2] === 'k') amount *= 1000;
    extracted.maxPrice = amount;
    query = query.replace(priceMatch[0], "");
  }

  // 3. Extract RAM
  const ramRegex = /(\d+)\s*gb\s*ram/i;
  const ramMatch = query.match(ramRegex);
  if (ramMatch) {
    extracted.ram = ramMatch[1] + "GB";
    query = query.replace(ramMatch[0], "");
  }

  // 4. Extract ROM / Storage
  const romRegex = /(\d+)\s*gb\s*(?:rom|storage)?/i;
  const romMatch = query.match(romRegex);
  if (romMatch) {
    if (!extracted.ram || romMatch[1] + "GB" !== extracted.ram) {
      extracted.rom = romMatch[1] + "GB";
      query = query.replace(romMatch[0], "");
    }
  }

  // Clean up remaining keywords
  extracted.keyword = query.replace(/phone|mobile|best|cheap/g, "").trim();
  if (!extracted.keyword && extracted.brand) {
    extracted.keyword = extracted.brand;
  }

  return extracted;
}