import { megaAdapter } from "./mega.js";
import { priceOyeAdapter } from "./priceoye.js";
import { genericAdapter } from "./generic.js";

// Every adapter exposes:
// async search(query) -> RawListing[]
//
// RawListing = {
//   title,
//   url,
//   image,
//   price,
//   originalPrice,
//   rating,
//   reviewCount,
//   inStock
// }

export const adapters = {
  "Mega.pk": megaAdapter,
  "PriceOye.pk": priceOyeAdapter,
};

export function getAdapter(storeName) {
  return adapters[storeName] ?? genericAdapter;
}
