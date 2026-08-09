// src/routes/history.js
import { Router } from "express";
import { query as db } from "../db/client.js";

const router = Router();

router.get("/products/:id/history", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db(
      `SELECT price, created_at AS recorded_at 
       FROM price_history 
       WHERE product_id = $1 
       ORDER BY created_at ASC`,
      [id]
    );

    // If there is only 1 entry, duplicate it to ensure the frontend sparkline 
    // and trend logic have at least 2 points to render without gaps or flat-line errors.
    let expandedRows = rows;
    if (rows.length === 1) {
      expandedRows = [rows[0], rows[0]];
    }

    res.json({ history: expandedRows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;