// src/routes/history.js
import { Router } from "express";
import { query as db } from "../db/client.js";

const router = Router();

router.get("/products/:id/history", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db(
      `SELECT price, recorded_at 
       FROM price_history 
       WHERE product_id = $1 
       ORDER BY recorded_at ASC`,
      [id]
    );
    res.json({ history: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;