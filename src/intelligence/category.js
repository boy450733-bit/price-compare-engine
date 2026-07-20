// src/intelligence/category.js

import {BRANDS} from "./brands.js";

const CATEGORY_RULES={
  mobile:[
    /\biphone\b/i,
    /\bgalaxy\b/i,
    /\bredmi\b/i,
    /\bpoco\b/i,
    /\brealme\b/i,
    /\boppo\b/i,
    /\bvivo\b/i,
    /\binfinix\b/i,
    /\btecno\b/i,
    /\bitel\b/i,
    /\bsmartphone\b/i,
    /\bmobile\b/i,
    /\bcell ?phone\b/i,
    /\b5g\b/i
  ],
  laptop:[
    /\blaptop\b/i,
    /\bnotebook\b/i,
    /\bmacbook\b/i,
    /\bthinkpad\b/i,
    /\bideapad\b/i,
    /\bvivobook\b/i,
    /\bzenbook\b/i,
    /\bchromebook\b/i,
    /\bxps\b/i,
    /\binspiron\b/i,
    /\bpavilion\b/i,
    /\bomen\b/i,
    /\bpredator\b/i
  ],
  tablet:[
    /\bipad\b/i,
    /\btablet\b/i,
    /\btab\b/i
  ],
  tv:[
    /\bsmart tv\b/i,
    /\bandroid tv\b/i,
    /\bgoogle tv\b/i,
    /\boled\b/i,
    /\bqled\b/i,
    /\bled tv\b/i,
    /\buhd\b/i,
    /\b4k tv\b/i,
    /\b8k tv\b/i
  ],
  monitor:[
    /\bmonitor\b/i,
    /\bdisplay\b/i,
    /\bips\b/i,
    /\bcurved\b/i,
    /\b165hz\b/i,
    /\b144hz\b/i,
    /\b240hz\b/i
  ],
  cpu:[
    /\bcore i3\b/i,
    /\bcore i5\b/i,
    /\bcore i7\b/i,
    /\bcore i9\b/i,
    /\bintel\b/i,
    /\bryzen\b/i,
    /\bprocessor\b/i,
    /\bcpu\b/i
  ],
  gpu:[
    /\brtx\b/i,
    /\bgtx\b/i,
    /\bradeon\b/i,
    /\barc\b/i,
    /\bgraphics card\b/i,
    /\bgpu\b/i
  ],
  appliance:[
    /\brefrigerator\b/i,
    /\bfridge\b/i,
    /\bdeep freezer\b/i,
    /\bfreezer\b/i,
    /\bair conditioner\b/i,
    /\bac\b/i,
    /\binverter ac\b/i,
    /\bwashing machine\b/i,
    /\bmicrowave\b/i,
    /\boven\b/i,
    /\bvacuum\b/i,
    /\bwater dispenser\b/i
  ],
  fashion:[
    /\bunstitched\b/i,
    /\bshirt\b/i,
    /\bkurta\b/i,
    /\bkurti\b/i,
    /\bsuit\b/i,
    /\bjeans\b/i,
    /\btrouser\b/i,
    /\bshoes\b/i,
    /\bsneakers\b/i,
    /\bsandal\b/i,
    /\bheels\b/i,
    /\bperfume\b/i
  ]
};

const BRAND_CATEGORY={};

Object.keys(BRANDS).forEach(category=>{
  BRANDS[category].forEach(brand=>{
    BRAND_CATEGORY[brand.toLowerCase()]=category;
  });
});

export function detectCategory(title=""){
  const text=title.toLowerCase();

  for(const [brand,category] of Object.entries(BRAND_CATEGORY)){
    if(text.includes(brand)) return category;
  }

  for(const [category,rules] of Object.entries(CATEGORY_RULES)){
    if(rules.some(rule=>rule.test(text))) return category;
  }

  return "unknown";
}

export function isCategory(title,category){
  return detectCategory(title)===category;
}

export function isMobile(title){
  return isCategory(title,"mobile");
}

export function isLaptop(title){
  return isCategory(title,"laptop");
}

export function isTablet(title){
  return isCategory(title,"tablet");
}

export function isTV(title){
  return isCategory(title,"tv");
}

export function isMonitor(title){
  return isCategory(title,"monitor");
}

export function isCPU(title){
  return isCategory(title,"cpu");
}

export function isGPU(title){
  return isCategory(title,"gpu");
}

export function isAppliance(title){
  return isCategory(title,"appliance");
}

export function isFashion(title){
  return isCategory(title,"fashion");
}
