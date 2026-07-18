// COPY THIS FILE to add a new store. Rename it e.g. daraz.config.js,
// fill in the fields below using your browser's Inspect tool on the
// store's real search results page, then register it in ../index.js
// (one line — see the comment there).

export const templateConfig = {
  name: "StoreName", // REQUIRED — must exactly match the `name` in your `stores` DB table
  baseUrl: "https://www.example.com", // REQUIRED — used to resolve relative links

  // REQUIRED — build the real search URL for this store.
  // Find it by typing a search into the store's own search box and
  // copying the resulting URL, then figure out where the query goes.
  searchUrl: (q) => `https://www.example.com/search?q=${encodeURIComponent(q)}`,

  selectors: {
    // REQUIRED — CSS selector that matches ONE product card/listing.
    // Find it in DevTools: right-click a product → Inspect → find the
    // smallest repeating parent element that wraps one whole product.
    container: ".product-card",

    // REQUIRED — selector (relative to container) for the title element.
    title: ".product-title",

    // Optional — only set this if the link is on a DIFFERENT element
    // than the title (e.g. the image is the link, not the title text).
    // link: "a.product-link",
    // linkAttr: "href",

    // Optional — selector (relative to container) for the product image.
    // Leave undefined entirely if you don't need images yet.
    image: ".product-image img",
    // imageAttr: "data-src", // some sites lazy-load images under a
    // different attribute than src — check DevTools if image comes back null

    // REQUIRED — selector (relative to container) for the price text.
    price: ".price",

    // Optional — selector for a struck-through "was" / original price,
    // if the site shows discounts. Leave as null if not applicable.
    originalPrice: null, // e.g. ".price .was" or ".old-price"
  },
};
