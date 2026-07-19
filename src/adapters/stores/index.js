import { megaConfig } from "./mega.config.js";
import { priceOyeConfig } from "./priceoye.config.js";
import { iShoppingConfig } from "./ishopping.config.js";
import { darazConfig } from "./daraz.config.js";

export const allStoreConfigs = [
  megaConfig,
  priceOyeConfig,
   // iShoppingConfig,  // disabled: Cloudflare managed challenge as of 2026-07-19
  darazConfig,
];
