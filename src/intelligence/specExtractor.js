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

export function extractSpecs(title=""){
  const text=title.toLowerCase();

  const specs={};

  // 1. RAM Extraction — handles explicit formats, shorthand slash formats (e.g., "8/128gb"), and commas
  const ramMatch =
    text.match(/(\d{1,2})\s*(?:gb)?\s*ram\b/i) || 
    text.match(/\bram\s*[:\-]?\s*(\d{1,2})\s*gb/i) ||
    text.match(/\b(\d{1,2})\s*\/\s*\d{2,4}\s*gb\b/i) ||
    text.match(/\b(\d{1,2})\s*gb\s*\/\s*\d{2,4}\s*gb\b/i);

  if (ramMatch) {
    specs.ram = ramMatch[1];
  }

  // 2. Storage Extraction — scan figures, avoiding the one claimed as RAM
  const romMatches = [...text.matchAll(/(\d{2,4})\s*(gb|tb)\b/gi)];
  const romCandidate = romMatches.find(
    (m) => !(specs.ram && m[1] === specs.ram)
  );
  if (romCandidate) {
    specs.storage = romCandidate[1] + " " + romCandidate[2].toUpperCase();
  }

  // 3. Battery (mAh)
  const battery = find(/(\d{4,5})\s*mah/i, text);
  if (battery) {
    specs.battery = battery + " mAh";
  }

  // 4. Display size (inches or quotes)
  const display = find(/(\d+(?:\.\d+)?)\s*(?:inch|inches|\b|")/i, text);
  // Refined safeguard against false inches match if it looks like a model number
  if (display && parseFloat(display) < 20) {
    specs.display = display + '"';
  }

  // 5. Refresh Rate (Hz)
  const refresh = find(/(\d{2,3})\s*hz/i, text);
  if (refresh) {
    specs.refreshRate = refresh + " Hz";
  }

  // 6. Camera (MP)
  const camera = find(/(\d{2,3})\s*(?:mp|megapixel)/i, text);
  if (camera) {
    specs.camera = camera + " MP";
  }

  // 7. CPU / Processors (Mobile, Desktop, and Laptops)
  const cpu = text.match(
    /\b(snapdragon\s*\+?\s*\w+\s*\d*|dimensity\s*\d+|helio\s*[a-z0-9]+|exynos\s*\d+|kirin\s*\d+|apple\s*a\d+\s*bionic|apple\s*m[1234](?:\s*pro|\s*max|\s*ultra)?|tensor\s*g\d+|core\s*i[3579]-?\d{4,5}[a-z]*|ryzen\s*[3579]\s*\d{4}[a-z]*)\b/i
  );
  if (cpu) {
    specs.cpu = cpu[1].toUpperCase();
  }

  // 8. GPU (Graphics cards)
  const gpu = text.match(
    /\b(rtx\s*\d{3,4}(?:\s*ti|\s*super)?|gtx\s*\d{3,4}(?:\s*ti)?|rx\s*\d{4}(?:\s*xt)?|arc\s*[a-z0-9]+)\b/i
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
    specs.sim = sim[1].toUpperCase();
  }

  return specs;
}
