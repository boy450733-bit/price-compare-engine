app.post("/api/alerts/subscribe", async (req, res) => {
  try {
    const { email, productId, targetPrice } = req.body;
    if (!email || !productId) {
      return res.status(400).json({ error: "Email and product ID are required." });
    }

    await pool.query(
      `INSERT INTO price_alerts (email, product_id, target_price) VALUES ($1, $2, $3)`,
      [email, productId, targetPrice || null]
    );

    res.json({ success: true, message: "Price alert subscription saved successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});