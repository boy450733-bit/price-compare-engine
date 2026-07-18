import { createAdapter } from "./createAdapter.js";
import { iShoppingConfig } from "./stores/iShopping.config.js";

export const iShoppingAdapter = createAdapter(iShoppingConfig);
