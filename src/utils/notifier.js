import nodemailer from "nodemailer";
import { pool } from "../db/client.js";

// Setup Nodemailer transporter using environment variables
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_SERVER || "smtp.example.com",
  port: parseInt(process.env.MAIL_PORT || "587", 10),
  secure: false,
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD,
  },
});

export async function checkAndSendPriceAlerts() {
  console.log("Running price alert check worker...");
  
  try {
    // 1. Fetch site settings containing email templates from the database
    const settingsRes = await pool.query("SELECT data FROM site_settings WHERE id = 1");
    const settings = settingsRes.rows[0]?.data || {};
    const alertsConfig = settings.alertsConfig || {};

    const subjectTemplate = alertsConfig.emailSubject || "🎉 Price Drop Alert for {product_title}!";
    const bodyTemplate = alertsConfig.emailBody || "Hello,\n\nGood news! The price for {product_title} has dropped to {target_price}.\n\nCheck it out here: {product_url}";

    // 2. Fetch pending, unnotified price alerts where current price matches or drops below target price
    // (Adjust this query based on your schema fields for current vs target price)
    const alertsRes = await pool.query(`
      SELECT a.id, a.email, a.target_price, p.title AS product_title, p.price AS current_price, p.url AS product_url, s.name AS store_name
      FROM price_alerts a
      JOIN products p ON a.product_id = p.id
      JOIN stores s ON p.store_id = s.id
      WHERE a.notified = false AND (a.target_price IS NULL OR p.price <= a.target_price)
    `);

    const pendingAlerts = alertsRes.rows;
    console.log(`Found ${pendingAlerts.length} pending price alerts to send.`);

    let sentCount = 0;
    for (const alert of pendingAlerts) {
      // Replace dynamic placeholders
      const subject = subjectTemplate
        .replace(/{product_title}/g, alert.product_title || "Product")
        .replace(/{target_price}/g, alert.target_price ? `Rs ${Number(alert.target_price).toLocaleString()}` : "N/A")
        .replace(/{current_price}/g, alert.current_price ? `Rs ${Number(alert.current_price).toLocaleString()}` : "N/A")
        .replace(/{store_name}/g, alert.store_name || "Store");

      const body = bodyTemplate
        .replace(/{product_title}/g, alert.product_title || "Product")
        .replace(/{target_price}/g, alert.target_price ? `Rs ${Number(alert.target_price).toLocaleString()}` : "N/A")
        .replace(/{current_price}/g, alert.current_price ? `Rs ${Number(alert.current_price).toLocaleString()}` : "N/A")
        .replace(/{store_name}/g, alert.store_name || "Store")
        .replace(/{product_url}/g, alert.product_url || "#");

      try {
        await transporter.sendMail({
          from: process.env.MAIL_DEFAULT_SENDER || '"Sasta.pk" <noreply@sasta.pk>',
          to: alert.email,
          subject: subject,
          text: body,
        });

        // Mark as notified in database so it doesn't send repeatedly
        await pool.query("UPDATE price_alerts SET notified = true WHERE id = $1", [alert.id]);
        sentCount++;
      } catch (emailErr) {
        console.error(`Failed to send alert email to ${alert.email}:`, emailErr.message);
      }
    }

    console.log(`Price alert check completed. Successfully sent ${sentCount} emails.`);
  } catch (err) {
    console.error("Error in checkAndSendPriceAlerts worker:", err.message);
  }
}
