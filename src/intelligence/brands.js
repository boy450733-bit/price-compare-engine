// src/intelligence/brands.js

export const BRANDS={
  mobile:[
    "Apple","Samsung","Xiaomi","Redmi","Poco","Realme","Oppo","Vivo","Infinix","Tecno","itel","Nokia","Motorola","OnePlus","Google","Honor","Huawei","Sony","Nothing","Asus","ZTE","Lenovo","Blackview","Doogee","Umidigi","Meizu","IQOO","CMF"
  ],
  laptop:[
    "Dell","HP","Lenovo","Asus","Acer","MSI","Apple","Microsoft","Samsung","Huawei","LG","Razer","Alienware","Gigabyte","Avita","Chuwi","Dynabook","Framework","Fujitsu"
  ],
  tablet:[
    "Apple","Samsung","Xiaomi","Lenovo","Huawei","Honor","Microsoft","Amazon","Nokia","Realme","OnePlus"
  ],
  tv:[
    "Samsung","LG","Sony","TCL","Haier","PEL","Orient","Dawlance","EcoStar","Hisense","Changhong","Panasonic","Philips","Xiaomi","Toshiba"
  ],
  monitor:[
    "Dell","LG","Samsung","MSI","AOC","BenQ","ViewSonic","Gigabyte","Asus","Acer","Philips","HP"
  ],
  gpu:[
    "NVIDIA","AMD","Gigabyte","MSI","Asus","Zotac","Sapphire","PowerColor","XFX","Palit","PNY","Inno3D","Colorful","Gainward","GALAX"
  ],
  cpu:[
    "Intel","AMD","Apple"
  ],
  appliance:[
    "Haier","PEL","Orient","Dawlance","Kenwood","Gree","Homage","Super Asia","Nasgas","Canon","Panasonic","Philips","Anex","Westpoint","Midea","Bosch"
  ],
  fashion:[
    "Khaadi","Gul Ahmed","Ideas","Ideas by GA","Maria B","Sana Safinaz","Limelight","Beechtree","Bonanza","Bonanza Satrangi","Alkaram","Cross Stitch","Bareeze","Zellbury","Outfitters","Breakout","Cambridge","Diners","Generation","Edenrobe","ChenOne","Stylo","Borjan","Ndure","Bata","Servis","Hush Puppies"
  ]
};

export const BRAND_ALIASES={
  "mi":"Xiaomi",
  "redmi":"Xiaomi",
  "iqoo":"iQOO",
  "iphone":"Apple",
  "galaxy":"Samsung",
  "macbook":"Apple",
  "thinkpad":"Lenovo",
  "ideapad":"Lenovo",
  "vivobook":"Asus",
  "zenbook":"Asus",
  "rog":"Asus",
  "predator":"Acer",
  "aspire":"Acer",
  "omen":"HP",
  "pavilion":"HP",
  "inspiron":"Dell",
  "latitude":"Dell",
  "xps":"Dell",
  "alienware":"Dell",
  "surface":"Microsoft",
  "bravia":"Sony"
};

export const ACCESSORY_KEYWORDS=[
  "cover","case","back cover","protector","screen protector","glass","tempered","charger","adapter","cable","usb cable","otg","earbuds","earphones","headphones","neckband","smartwatch","watch","band","strap","battery","housing","frame","lcd","display","touch","speaker","mic","camera lens","tripod","mount","stand","keyboard","mouse","bag","sleeve","skin","sticker","power bank","dock","holder","remote","replacement","spare","accessory"
];

export const STORAGE_VALUES=[
  "16GB","32GB","64GB","128GB","256GB","512GB","1TB","2TB"
];

export const RAM_VALUES=[
  "2GB","3GB","4GB","6GB","8GB","12GB","16GB","18GB","24GB","32GB","64GB"
];

export const NETWORK_TYPES=[
  "2G","3G","4G","4G LTE","5G"
];

export const COLORS=[
  "Black","White","Blue","Red","Green","Pink","Purple","Silver","Gold","Gray","Grey","Titanium","Midnight","Starlight","Sky Blue","Navy","Orange","Yellow","Awesome Black","Awesome White","Awesome Blue","Awesome Pink","Phantom Black","Phantom White","Natural Titanium","Desert Titanium"
];

export const CPU_FAMILIES=[
  "Core i3","Core i5","Core i7","Core i9","Ultra 5","Ultra 7","Ultra 9","Ryzen 3","Ryzen 5","Ryzen 7","Ryzen 9","Snapdragon","Dimensity","Helio","Exynos","Tensor","Apple M1","Apple M2","Apple M3","Apple M4"
];

export const GPU_FAMILIES=[
  "RTX 2050","RTX 3050","RTX 4050","RTX 4060","RTX 4070","RTX 4080","RTX 4090","GTX 1650","RX 6600","RX 7600","RX 7700","RX 7800","Arc A370M","Arc A530M"
];

const ALL_BRANDS=new Set(Object.values(BRANDS).flat());

export function getAllBrands(){
  return [...ALL_BRANDS];
}

export function normalizeBrand(value=""){
  const text=value.trim();
  const alias=BRAND_ALIASES[text.toLowerCase()];
  if(alias) return alias;
  for(const brand of ALL_BRANDS){
    if(brand.toLowerCase()===text.toLowerCase()) return brand;
  }
  return text;
}

export function findBrand(title=""){
  const lower=title.toLowerCase();
  for(const brand of ALL_BRANDS){
    if(lower.includes(brand.toLowerCase())) return brand;
  }
  for(const [alias,brand] of Object.entries(BRAND_ALIASES)){
    if(lower.includes(alias)) return brand;
  }
  return null;
}
