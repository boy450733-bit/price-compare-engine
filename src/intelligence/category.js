// src/intelligence/category.js

const CATEGORY_KEYWORDS={
  Mobile:[
    "iphone","galaxy","redmi","xiaomi","oppo","vivo","realme","infinix",
    "tecno","oneplus","pixel","honor","huawei","nokia","motorola",
    "itel","spark","poco","iqoo","zte","asus rog phone",
    "phone","smartphone","mobile","cellphone"
  ],
  Laptop:[
    "laptop","notebook","macbook","thinkpad","ideapad","vivobook",
    "zenbook","victus","omen","legion","inspiron","latitude",
    "elitebook","probook","rog","tuf","surface","chromebook",
    "helios","triton","stealth","blade","swift","aspire","hp 15",
    "hp pavilion","asus vivobook","acer aspire"
  ],
  Tablet:[
    "tablet","ipad","tab","galaxy tab","xiaomi pad","lenovo tab",
    "pad","matepad","surface pro","ipad air","ipad pro","ipad mini"
  ],
  Smartwatch:[
    "watch","smartwatch","apple watch","galaxy watch","watch fit",
    "smart band","fitness band","miband","amazfit","garmin","fitbit"
  ],
  Earbuds:[
    "earbuds","earbud","buds","airpods","airdots","tws","buds pro",
    "wireless earphones","bluetooth earphones","in-ear wireless"
  ],
  Headphones:[
    "headphone","headphones","headset","gaming headset",
    "wireless headphone","over-ear","on-ear"
  ],
  Monitor:[
    "monitor","display","ips","oled monitor","gaming monitor",
    "ultrawide","curved monitor","flat screen monitor","lcd display"
  ],
  TV:[
    "tv","smart tv","android tv","google tv","oled tv","qled",
    "led tv","miniled","uhd tv","4k tv","8k tv","television"
  ],
  GPU:[
    "rtx","gtx","radeon","graphics card","graphic card","rx ",
    "rtx 30","rtx 40","rtx 50","rx 6000","rx 7000","gt 1030","arc a770"
  ],
  CPU:[
    "processor","cpu","ryzen","core i3","core i5","core i7","core i9",
    "intel","athlon","pentium","celeron","threadripper","xeon",
    "ryzen 3","ryzen 5","ryzen 7","ryzen 9","ultra 7","ultra 5","ultra 9"
  ],
  Motherboard:[
    "motherboard","mainboard","b650","b550","z790","h610","x670",
    "z690","b450","x570","h670","lga1700","am5","am4"
  ],
  RAM:[
    "ddr4","ddr5","memory","ram module","sodimm","udimm",
    "desktop ram","laptop ram","ddr3"
  ],
  SSD:[
    "ssd","nvme","m.2","solid state drive","pcie ssd","sata ssd",
    "portable ssd","m.2 nvme"
  ],
  HDD:[
    "hard drive","hdd","hard disk","external hard drive",
    "desktop hdd","nas hdd"
  ],
  Refrigerator:[
    "refrigerator","fridge","deep freezer","freezer",
    "double door fridge","single door fridge","inverter refrigerator"
  ],
  WashingMachine:[
    "washing machine","washer","front load","top load",
    "washer dryer","semi automatic washer","fully automatic washing machine"
  ],
  AirConditioner:[
    "air conditioner","ac","split ac","inverter ac",
    "window ac","portable ac","floor standing ac"
  ],
  Microwave:[
    "microwave","oven","microwave oven","convection oven","grill microwave"
  ],
  Camera:[
    "camera","dslr","mirrorless","gopro","action camera",
    "vlog camera","security camera","cctv"
  ]
};

// Strict Exclusion terms: Prevents internal specs from hijacking main systems
const EXCLUSIONS = {
  Mobile: [
    "buds", "earbuds", "earbud", "airpods", "airdots", "tws", "headphone", 
    "headphones", "headset", "watch", "smartwatch", "band", "tablet", "ipad", 
    "cover", "case", "glass", "charger", "adapter", "cable", "laptop", "notebook"
  ],
  Laptop: [
    "sleeve", "bag", "charger", "adapter", "keyboard", "mouse"
  ],
  // Component categories like SSD, RAM, CPU should NOT match if a full system noun is present
  SSD: [
    "laptop", "notebook", "macbook", "phone", "smartphone", "mobile", "tablet", "ipad", "ultra 7", "core i7"
  ],
  HDD: [
    "laptop", "notebook", "macbook", "phone", "smartphone", "mobile", "tablet", "ipad"
  ],
  RAM: [
    "laptop", "notebook", "macbook", "phone", "smartphone", "mobile", "tablet", "ipad", "ultra 7"
  ],
  CPU: [
    "laptop", "notebook", "macbook", "phone", "smartphone", "mobile", "tablet", "ipad"
  ]
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const KEYWORD_REGEX = new Map();
function keywordRegex(keyword) {
  if (!KEYWORD_REGEX.has(keyword)) {
    KEYWORD_REGEX.set(keyword, new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i"));
  }
  return KEYWORD_REGEX.get(keyword);
}

export function detectCategory(title=""){
  const text=title.toLowerCase();

  // Pre-check for clear system indicators to guarantee correct high-level categorization
  if (/\b(laptop|notebook|macbook|thinkpad|ideapad|vivobook|zenbook|victus|omen|legion|chromebook|hp\s*\d+)\b/i.test(text)) {
    return "Laptop";
  }
  if (/\b(smartphone|iphone|galaxy\s*[a-z]\d|redmi|oppo|vivo|realme|infinix|tecno)\b/i.test(text)) {
    return "Mobile";
  }

  let best="Other";
  let score=0;

  for(const [category,keywords] of Object.entries(CATEGORY_KEYWORDS)){
    // Dual Check: Block category if an exclusion rule matches
    const exclusions = EXCLUSIONS[category] || [];
    const isExcluded = exclusions.some(ex => keywordRegex(ex).test(text));
    if (isExcluded) {
      continue; 
    }

    let matches=0;

    for(const keyword of keywords){
      if(keywordRegex(keyword).test(text)){
        matches++;
      }
    }

    if(matches>score){
      score=matches;
      best=category;
    }
  }

  return best;
}

export function isCategory(title,category){
  return detectCategory(title)===category;
}