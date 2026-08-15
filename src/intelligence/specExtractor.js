// src/intelligence/specExtractor.js

const COLOR_WORDS=[
  "black","white","blue","red","green","yellow","purple","pink","gold",
  "silver","gray","grey","graphite","midnight","navy","orange","violet",
  "cream","beige","ivory","teal","cyan","bronze","pearl","titanium",
  "starlight","lavender","mint","ocean","forest","desert","sand","space gray",
  "space grey","rose gold","phantom black","alpine green","cereal"
];

function find(regex,text){
  const m=text.match(regex);
  return m?m[1]:null;
}

export function extractSpecs(title = "", details = "") {
  // Combine the title and any scraped description/spec table text into one block
  const text = `${title} ${details}`.toLowerCase();
  
  const specs = {};
  // 1. RAM Extraction — handles explicit formats, shorthand slash formats (e.g., "8/128gb"), and commas
  const ramMatch =
    text.match(/(\d{1,2})\s*(?:gb)?\s*ram\b/i) || 
    text.match(/\bram\s*[:\-]?\s*(\d{1,2})\s*gb/i) ||
    text.match(/\b(\d{1,2})\s*\/\s*\d{2,4}\s*gb\b/i) ||
    text.match(/\b(\d{1,2})\s*gb\s*\/\s*\d{2,4}\s*gb\b/i);

  if (ramMatch) {
    specs.ram = ramMatch[1];
  }

  // 2. Storage Extraction — Upgraded to \d{1,4} to successfully capture "1TB" or "2TB"
  const romMatches = [...text.matchAll(/(\d{1,4})\s*(gb|tb)\b/gi)];
  
  // Safely find the storage value, ensuring it doesn't accidentally grab the RAM value
  const romCandidate = romMatches.find(
    (m) => !(specs.ram && m[1] === specs.ram && m[2].toLowerCase() === 'gb')
  );
  
  if (romCandidate) {
    // Standardize to uppercase (e.g., "128GB" or "1TB")
    specs.storage = romCandidate[1] + romCandidate[2].toUpperCase();
  }

  // 3. Battery (mAh)
  const battery = find(/(\d{3,5})\s*mah/i, text);
  if (battery) {
    specs.battery = battery + " mAh";
  }

  // 4. Display size (inches or quotes)
  const display = find(/(\d+(?:\.\d+)?)\s*(?:inch|inches|\b|")/i, text);
  if (display && parseFloat(display) < 20 && parseFloat(display) > 1) {
    specs.display = display + '"';
  }

  // 5. Refresh Rate (Hz)
  const refresh = find(/(\d{2,3})\s*hz/i, text);
  if (refresh) {
    specs.refreshRate = refresh + " Hz";
  }

  // 6. Camera (MP) — Upgraded to support decimals (e.g., "50.5MP")
  const camera = find(/(\d+(?:\.\d+)?)\s*(?:mp|megapixel)/i, text);
  if (camera) {
    specs.camera = camera + " MP";
  }

  // 7. CPU / Processors — Upgraded to support "Gen 1/2/3" and "A17 Pro" 
  const cpu = text.match(
    /\b(snapdragon\s*\d[a-z0-9\s]*gen\s*\d|snapdragon\s*\+?\s*\w+\s*\d*|dimensity\s*\d+|helio\s*[a-z0-9]+|exynos\s*\d+|kirin\s*\d+|apple\s*a\d+(?:\s*pro|\s*bionic)?|apple\s*m[1234](?:\s*pro|\s*max|\s*ultra)?|tensor\s*g\d+|core\s*(?:ultra\s*)?i?[3579]-?\d{4,5}[a-z]*|ryzen\s*[3579]\s*\d{4}[a-z]*)\b/i
  );
  if (cpu) {
    // Convert to strict Title Case for database cleanliness (e.g., "Snapdragon 8 Gen 3")
    specs.cpu = cpu[1]
      .replace(/\s+/g, ' ')
      .replace(/(^|\s)\w/g, c => c.toUpperCase())
      .trim();
  }

  // 8. GPU — Added support for mobile Adreno and Mali chips
  const gpu = text.match(
    /\b(rtx\s*\d{3,4}(?:\s*ti|\s*super)?|gtx\s*\d{3,4}(?:\s*ti)?|rx\s*\d{4}(?:\s*xt)?|arc\s*[a-z0-9]+|adreno\s*\d+|mali\s*[-g\d]+)\b/i
  );
  if (gpu) {
    specs.gpu = gpu[1].toUpperCase();
  }

  // 9. Color variant
  const color = COLOR_WORDS.find(c => text.includes(c));
  if (color) {
    specs.color = color.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // 10. Network Generation (4G / 5G)
  const network = text.match(/\b(4g|5g)\b/i);
  if (network) {
    specs.network = network[1].toUpperCase();
  }

  // 11. SIM support type
  const sim = text.match(/\b(single sim|dual sim|e-sim|esim)\b/i);
  if (sim) {
    // Standardize e-sim to E-SIM
    let simType = sim[1].toUpperCase();
    if (simType === "ESIM") simType = "E-SIM";
    specs.sim = simType;
  }

  return specs;
}
