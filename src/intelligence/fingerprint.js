// src/intelligence/fingerprint.js
import crypto from "node:crypto";

function slug(value = "") {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function createFingerprint(product) {
  const parts = [];

  // Use the FULL cleaned title instead of the stripped model to prevent cross-generation merging
  const coreIdentity = product.cleanedTitle || product.model || "unknown";
  parts.push(slug(coreIdentity));

  const specs = product.specs || {};

  if (specs.ram) parts.push(slug(specs.ram));
  if (specs.storage) parts.push(slug(specs.storage));
  if (specs.network) parts.push(slug(specs.network));

  const raw = parts.join("|");

  return crypto
    .createHash("sha1")
    .update(raw)
    .digest("hex");
}

export function fingerprintText(product) {
  const specs = product.specs || {};

  return [
    product.category,
    product.brand,
    product.model,
    specs.ram,
    specs.storage,
    specs.cpu,
    specs.gpu,
    specs.display
  ]
    .filter(Boolean)
    .join("|")
    .toLowerCase();
}
