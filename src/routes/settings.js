import { Router } from "express";
import { query as db } from "../db/client.js";
import { defaultSettings } from "../config/defaultSettings.js";

const router = Router();

// Merge stored settings over the defaults so a partially-configured
// settings row (or a brand-new one) never leaves the frontend with
// missing/undefined keys. Nested objects (theme, cardFeatures) are
// merged key-by-key rather than replaced wholesale — a shallow
// `{...defaults, ...stored}` would let a partially-saved `theme` object
// silently drop the other theme keys' defaults instead of falling back
// to them.
function mergeSettings(defaults, stored = {}) {
  const merged = { ...defaults, ...stored };
  for (const key of Object.keys(defaults)) {
    const defaultValue = defaults[key];
    const storedValue = stored[key];
    const isPlainObject = (v) =>
      v && typeof v === "object" && !Array.isArray(v);
    if (isPlainObject(defaultValue) && isPlainObject(storedValue)) {
      merged[key] = { ...defaultValue, ...storedValue };
    }
  }
  return merged;
}

router.get("/settings", async (_req, res) => {
  const { rows } = await db(`SELECT data FROM site_settings WHERE id = 1`);
  const settings = mergeSettings(defaultSettings, rows[0]?.data || {});

  // Send ONLY safe public configuration properties
  const publicSettings = {
    logoText: settings.logoText,
    siteUrl: settings.siteUrl || "",
    heroSubtitle: settings.heroSubtitle,
    heroQuotes: settings.heroQuotes,
    footerText: settings.footerText,
    theme: settings.theme,
    cardFeatures: settings.cardFeatures,
    customHead: settings.customHead || "" // Added for your head/revenue tags
  };
    // Note: alertsConfig and adminToken are completely excluded here
  };

  res.json(publicSettings);
});
export default router;
