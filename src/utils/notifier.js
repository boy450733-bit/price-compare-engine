import nodemailer from "nodemailer";
import { pool } from "../db/client.js";
import "dotenv/config";

// Create the transporter using your custom domain SMTP settings
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // true for 465, false for other ports like 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function checkAndSendPriceAlerts() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("Skipping price alert check: SMTP credentials not configured.");
    return;
  }

  try {
    console.log("Running scheduled price drop alert check...");

    // Fetch un-notified alerts where product price meets target
    const { rows: alerts } = await pool.query(`
      SELECT 
        a.id as alert_id, 
        a.email, 
        a.target_price,
        p.id as product_id, 
        p.title, 
        p.min_price
      FROM price_alerts a
      JOIN products p ON a.product_id = p.id
      WHERE a.notified = false
    `);

    for (const alert of alerts) {
      const currentPrice = Number(alert.min_price);
      const targetPrice = alert.target_price ? Number(alert.target_price) : null;

      if (targetPrice && currentPrice <= targetPrice) {
        // Send the mail using your custom domain address
        await transporter.sendMail({
          from: `"Sasta.pk Alerts" <${process.env.SMTP_USER}>`,
          to: alert.email,
          subject: `🔥 Price Drop Alert: ${alert.title}`,
          text: `The price for ${alert.title} has dropped to Rs ${currentPrice.toLocaleString()}.`,
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #17231D;">
              <h2 style="color: #0B6E4F;">Great News! Price Dropped!</h2>
              <p>The price for <strong>${alert.title}</strong> has dropped to <strong>Rs ${currentPrice.toLocaleString()}</strong>.</p>
              <p><a href="https://price-compare-engine-production.up.railway.app" style="background: #0B6E4F; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">View Deal Now</a></p>
              <p style="font-size: 12px; color: #5B6B62; margin-top: 20px;">You are receiving this because you signed up for price alerts on Sasta.pk.</p>
            </div>
          `,
        });

        // Mark as notified to prevent duplicate emails
        await pool.query(`UPDATE price_alerts SET notified = true WHERE id = $1`, [alert.alert_id]);
        console.log(`Alert email sent to ${alert.email} for product ${alert.product_id}`);
      }
    }
  } catch (err) {
    console.error("Error running price alert cron job:", err.message);
  }
}