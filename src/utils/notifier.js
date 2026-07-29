import nodemailer from "nodemailer";
import { pool } from "../db/client.js";

export async function checkAndSendPriceAlerts() {
  console.log("Running price alert check worker...");
  
  try {
    const settingsRes = await pool.query("SELECT data FROM site_settings WHERE id = 1");
    const settings = settingsRes.rows[0]?.data || {};
    const alertsConfig = settings.alertsConfig || {};

    // Retrieve multiple mailers configured in admin panel, falling back to legacy single config or .env
    let mailers = alertsConfig.mailers || [];
    
    if (mailers.length === 0) {
      // Fallback to legacy single configuration if multi-mailers array is empty
      mailers = [{
        name: "Default Mailer",
        host: alertsConfig.mailServer || process.env.MAIL_SERVER || "smtp.ethereal.email",
        port: parseInt(alertsConfig.mailPort || process.env.MAIL_PORT || "587", 10),
        secure: typeof alertsConfig.mailSecure === "boolean" ? alertsConfig.mailSecure : (parseInt(alertsConfig.mailPort) === 465),
        username: alertsConfig.mailUsername || process.env.MAIL_USERNAME,
        password: alertsConfig.mailPassword || process.env.MAIL_PASSWORD,
        sender: alertsConfig.mailSender || process.env.MAIL_DEFAULT_SENDER || '"Sasta.pk" <noreply@sasta.pk>',
        active: true
      }];
    }

    // Filter only active mailers
    const activeMailers = mailers.filter(m => m.active !== false);
    if (activeMailers.length === 0) {
      console.error("No active mailers configured for sending alerts!");
      return;
    }

    const rotationMode = alertsConfig.mailerRotationMode || "round-robin"; // "round-robin", "random", or "fallback"
    let mailerIndex = 0;

    function getNextTransporter() {
      if (activeMailers.length === 0) return null;
      
      let config;
      if (rotationMode === "random") {
        config = activeMailers[Math.floor(Math.random() * activeMailers.length)];
      } else {
        // Round-robin
        config = activeMailers[mailerIndex % activeMailers.length];
        mailerIndex++;
      }

      const transporter = nodemailer.createTransport({
        host: config.host,
        port: parseInt(config.port, 10),
        secure: config.secure,
        auth: (config.username && config.password) ? { user: config.username, pass: config.password } : undefined,
      });

      return { transporter, sender: config.sender || '"Sasta.pk" <noreply@sasta.pk>', name: config.name || "Mailer" };
    }

    const subjectTemplate = alertsConfig.emailSubject || "🎉 Price Drop Alert for {product_title}!";
    const bodyTemplate = alertsConfig.emailBody || "Hello,\n\nGood news! The price for {product_title} has dropped to {target_price}.\n\nCheck it out here: {product_url}";

    const alertsRes = await pool.query(`
      SELECT a.id, a.email, a.target_price, p.title AS product_title, p.price AS current_price, p.url AS product_url, p.store AS store_name
      FROM price_alerts a
      JOIN products p ON a.product_id = p.id
      WHERE a.notified = false AND (a.target_price IS NULL OR p.price <= a.target_price)
    `);

    const pendingAlerts = alertsRes.rows;
    console.log(`Found ${pendingAlerts.length} pending price alerts to send.`);

    let sentCount = 0;
    for (const alert of pendingAlerts) {
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

      let sentSuccessfully = false;
      let attempts = 0;
      const maxAttempts = activeMailers.length;

      // Try sending, with fallback capability if rotationMode is fallback or quota fails
      while (!sentSuccessfully && attempts < maxAttempts) {
        const mailConfig = getNextTransporter();
        if (!mailConfig) break;

        try {
          const info = await mailConfig.transporter.sendMail({
            from: mailConfig.sender,
            to: alert.email,
            subject: subject,
            text: body,
          });

          console.log(`[${mailConfig.name}] Message sent: %s`, info.messageId);
          console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));

          await pool.query("UPDATE price_alerts SET notified = true WHERE id = $1", [alert.id]);
          sentCount++;
          sentSuccessfully = true;
        } catch (emailErr) {
          attempts++;
          console.error(`[${mailConfig.name}] Failed to send alert email to ${alert.email}:`, emailErr.message);
          if (rotationMode !== "fallback") {
            break; // Stop loop if round-robin and single attempt fails unless set to fallback
          }
        }
      }
    }

    console.log(`Price alert check completed. Successfully sent ${sentCount} emails.`);
  } catch (err) {
    console.error("Error in checkAndSendPriceAlerts worker:", err.message);
  }
}
