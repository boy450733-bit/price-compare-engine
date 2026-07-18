import { createAdapter } from "./createAdapter.js";
import { genericAdapter } from "./generic.js";
import { megaConfig } from "./stores/mega.config.js";
// import { darazConfig } from "./stores/daraz.config.js";
// import { priceOyeConfig } from "./stores/priceoye.config.js";

// Adding a new store = add its config import above, then one line below.
// No other file needs to change.
const configs = {
  "Mega.pk": megaConfig,
  // "Daraz": darazConfig,
  // "PriceOye": priceOyeConfig,
};

const adapterCache = {};

export function getAdapter(storeName) {
  if (!configs[storeName]) return genericAdapter;
  if (!adapterCache[storeName]) {
    adapterCache[storeName] = createAdapter(configs[storeName]);
  }
  return adapterCache[storeName];
}
