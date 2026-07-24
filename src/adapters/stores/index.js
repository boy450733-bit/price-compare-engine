import { megaConfig } from "./mega.config.js";
import { priceOyeConfig } from "./priceoye.config.js";
import { iShoppingConfig } from "./ishopping.config.js";
import { darazConfig } from "./daraz.config.js";
import { eezepcConfig } from "./eezepc.config.js";
import { shophiveConfig } from "./shophive.config.js";
import { flashiConfig } from "./flashi.config.js";

// This is the ONLY place you list active stores. Both the adapter
// registry (src/adapters/index.js) and the auto-seed step
// (src/server.js) read from this array, so adding a store here is
// enough to make it show up in both places.
export const allStoreConfigs = [
  megaConfig,
  priceOyeConfig,
  iShoppingConfig, // currently blocked by Cloudflare managed challenge — see earlier notes
  darazConfig,
  eezepcConfig,
  shophiveConfig,
  flashiConfig,
];
