// src/intelligence/category.js

const CATEGORY_KEYWORDS={
  Mobile:[
    "iphone","galaxy","redmi","xiaomi","oppo","vivo","realme","infinix",
    "tecno","oneplus","pixel","honor","huawei","nokia","motorola",
    "phone","smartphone","mobile"
  ],
  Laptop:[
    "laptop","notebook","macbook","thinkpad","ideapad","vivobook",
    "zenbook","victus","omen","legion","inspiron","latitude",
    "elitebook","probook","rog","tuf","surface"
  ],
  Tablet:[
    "tablet","ipad","tab","galaxy tab","xiaomi pad","lenovo tab"
  ],
  Smartwatch:[
    "watch","smartwatch","apple watch","galaxy watch","watch fit"
  ],
  Earbuds:[
    "earbuds","earbud","buds","airpods","airdots","tws","buds pro"
  ],
  Headphones:[
    "headphone","headphones","headset","gaming headset"
  ],
  Monitor:[
    "monitor","display","ips","oled monitor","gaming monitor"
  ],
  TV:[
    "tv","smart tv","android tv","google tv","oled tv","qled"
  ],
  GPU:[
    "rtx","gtx","radeon","graphics card","graphic card","rx "
  ],
  CPU:[
    "processor","cpu","ryzen","core i3","core i5","core i7","core i9",
    "intel","athlon","pentium","celeron"
  ],
  Motherboard:[
    "motherboard","mainboard","b650","b550","z790","h610","x670"
  ],
  RAM:[
    "ddr4","ddr5","memory","ram module","sodimm","udimm"
  ],
  SSD:[
    "ssd","nvme","m.2","solid state drive"
  ],
  HDD:[
    "hard drive","hdd","hard disk"
  ],
  Refrigerator:[
    "refrigerator","fridge","deep freezer","freezer"
  ],
  WashingMachine:[
    "washing machine","washer"
  ],
  AirConditioner:[
    "air conditioner","ac","split ac","inverter ac"
  ],
  Microwave:[
    "microwave","oven"
  ],
  Camera:[
    "camera","dslr","mirrorless","gopro"
  ]
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Cache compiled keyword regexes so we don't rebuild them on every call.
const KEYWORD_REGEX = new Map();
function keywordRegex(keyword) {
  if (!KEYWORD_REGEX.has(keyword)) {
    // \b word-boundary matching — without this, short keywords like "ac"
    // or "tv" match as substrings inside unrelated words ("MacBook",
    // "Black", "Track", "Native"...) and cause miscategorization.
    KEYWORD_REGEX.set(keyword, new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i"));
  }
  return KEYWORD_REGEX.get(keyword);
}

export function detectCategory(title=""){
  const text=title.toLowerCase();

  let best="Other";
  let score=0;

  for(const [category,keywords] of Object.entries(CATEGORY_KEYWORDS)){
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
