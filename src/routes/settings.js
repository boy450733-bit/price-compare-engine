import { Router } from "express";
import { query as db } from "../db/client.js";
import { defaultSettings } from "../config/defaultSettings.js";

const router = Router();

router.get("/settings", async (_req, res) => {
  const { rows } = await db(`SELECT data FROM site_settings WHERE id = 1`);
  // Merge over defaults so a partially-configured settings row (or a
  // brand-new one) never leaves the frontend with missing/undefined keys.
  const settings = { ...defaultSettings, ...(rows[0]?.data || {}) };
  res.json(settings);
});

export default router;
