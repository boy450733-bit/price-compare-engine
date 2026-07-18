import { createAdapter } from "./createAdapter.js";
import { genericAdapter } from "./generic.js";
import { megaConfig } from "./mega.config.js";
import { priceOyeConfig } from "./priceoye.config.js";

export const allStoreConfigs = [
  megaConfig,
  priceOyeConfig,
];

const adapterCache = {};
export function getAdapter(storeName) {
  if (!configs[storeName]) return genericAdapter;
  if (!adapterCache[storeName]) {
    adapterCache[storeName] = createAdapter(configs[storeName]);
  }
  return adapterCache[storeName];
}
