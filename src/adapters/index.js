import { createAdapter } from "./createAdapter.js";
import { genericAdapter } from "./generic.js";
import { megaConfig } from "./stores/mega.config.js";
// import { darazConfig } from "./stores/daraz.config.js";

const configs = {
  "Mega.pk": megaConfig,
  // "Daraz": darazConfig,
};

const adapterCache = {};
export function getAdapter(storeName) {
  if (!configs[storeName]) return genericAdapter;
  if (!adapterCache[storeName]) {
    adapterCache[storeName] = createAdapter(configs[storeName]);
  }
  return adapterCache[storeName];
}
