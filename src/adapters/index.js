import { megaAdapter } from "./mega.js";
import { genericAdapter } from "./generic.js";

// Every adapter exposes: async search(query) -> RawListing[]
// RawListing = { title, url, image, price, originalPrice, rating, reviewCount, inStock }
export const adapters = {
  "Mega.pk": megaAdapter,
  // Add real adapters per store as you build them, e.g.:
  // "Daraz": darazAdapter,
  // "PriceOye": priceOyeAdapter,
  // "Telemart": telemartAdapter,
};

export function getAdapter(storeName) {
  return adapters[storeName] || genericAdapter;
}
