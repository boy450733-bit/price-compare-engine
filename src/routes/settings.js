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

  // Create a safe clone to prevent leaking secrets to public users
  const publicSettings = { ...settings };

  // 1. Strip the admin token entirely
  delete publicSettings.adminToken;

  // 2. Strip or sanitize mailer passwords if present in public config
  if (publicSettings.alertsConfig && Array.isArray(publicSettings.alertsConfig.mailers)) {
    publicSettings.alertsConfig.mailers = publicSettings.alertsConfig.mailers.map(mailer => ({
      ...mailer,
      password: "" // Blank out passwords entirely for public viewers
    }));
  }

  if (publicSettings.alertsConfig?.mailPassword) {
    publicSettings.alertsConfig.mailPassword = "";
  }

  res.json(publicSettings);
});

export default router;
