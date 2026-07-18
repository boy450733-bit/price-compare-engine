import { createAdapter } from "./createAdapter.js";
import { genericAdapter } from "./generic.js";
import { allStoreConfigs } from "./stores/index.js";

const configs = Object.fromEntries(allStoreConfigs.map((c) => [c.name, c]));
const adapterCache = {};

export function getAdapter(storeName) {
  if (!configs[storeName]) return genericAdapter;
  if (!adapterCache[storeName]) {
    adapterCache[storeName] = createAdapter(configs[storeName]);
  }
  return adapterCache[storeName];
}
