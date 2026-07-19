import { Router } from "express";
import { query as db } from "../db/client.js";

const router = Router();

router.get("/stores", async (_req, res) => {
  const { rows } = await db(
    `SELECT name, color FROM stores WHERE enabled = true ORDER BY name`
  );
  res.json({ stores: rows });
});

export default router;
