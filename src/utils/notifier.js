import nodemailer from "nodemailer";
import { pool } from "../db/client.js";

export async function checkAndSendPriceAlerts() {
  console.log("----------------------------------------");
  console.log("[Worker] Running price alert check worker...");
  
  try {
    const settingsRes = await pool.query("SELECT data FROM site_settings WHERE id = 1");
    const settings = settingsRes.rows[0]?.data || {};
    const alertsConfig = settings.alertsConfig || {};

    let mailers = alertsConfig.mailers || [];
    console.log(`[Worker] Found ${mailers.length} mailer profiles in database settings.`);
    
    if (mailers.length === 0) {
      console.log("[Worker] No mailers found in array, falling back to legacy/env configuration.");
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

    const activeMailers = mailers.filter(m => m.active !== false);
    console.log(`[Worker] Active mailer count: ${activeMailers.length}`);

    if (activeMailers.length === 0) {
      console.error("[Worker] ERROR: No active mailers configured for sending alerts!");
      return;
    }

    const rotationMode = alertsConfig.mailerRotationMode || "round-robin";
    console.log(`[Worker] Mailer rotation mode: ${rotationMode}`);
    
    let mailerIndex = 0;

    function getNextTransporter() {
      if (activeMailers.length === 0) return null;
      
      let config;
      if (rotationMode === "random") {
        config = activeMailers[Math.floor(Math.random() * activeMailers.length)];
      } else {
        config = activeMailers[mailerIndex % activeMailers.length];
        mailerIndex++;
      }

      console.log(`printing json object`);
      console.log(JSON.stringify(config, null, 2));

      const transporter = nodemailer.createTransport({
        host: config.host,
        port: parseInt(config.port, 10),
        secure: config.secure,
        auth: (config.username && config.password) ? { user: config.username, pass: config.password } : undefined,
        connectionTimeout: 30000, // 10 seconds timeout limit to prevent hanging
        socketTimeout: 30000,
        logger: true,
        debug: true
      });

      return { 
        transporter, 
        sender: config.sender || '"Sasta.pk" <noreply@sasta.pk>', 
        name: config.name || "Mailer",
        config 
      };
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
    console.log(`[Worker] Found ${pendingAlerts.length} pending price alerts to send.`);

    let sentCount = 0;
    for (const alert of pendingAlerts) {
      console.log(`[Alert] Processing alert ID ${alert.id} for target recipient: ${alert.email}`);

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

      while (!sentSuccessfully && attempts < maxAttempts) {
        const mailConfig = getNextTransporter();
        if (!mailConfig) break;

        try {
          console.log(`[SMTP] Verifying connection for "${mailConfig.name}"...`);
          await mailConfig.transporter.verify();
          console.log(`[SMTP] Verification successful for "${mailConfig.name}". Sending email...`);

          const info = await mailConfig.transporter.sendMail({
            from: mailConfig.sender,
            to: alert.email,
            subject: subject,
            text: body,
          });

          console.log(`[Success] [${mailConfig.name}] Message sent successfully! ID: ${info.messageId}`);

          await pool.query("UPDATE price_alerts SET notified = true WHERE id = $1", [alert.id]);
          sentCount++;
          sentSuccessfully = true;
        } catch (emailErr) {
          attempts++;
          console.error(`[Error] [${mailConfig.name}] Failed to send via this mailer. Error: ${emailErr.message}`);
          
          if (rotationMode !== "fallback") {
            console.log(`[Worker] Rotation mode is '${rotationMode}', halting further fallback attempts for this alert.`);
            break; 
          } else {
            console.log(`[Worker] Rotation mode is 'fallback', trying next available mailer (Attempt ${attempts}/${maxAttempts})...`);
          }
        }
      }
    }

    console.log(`[Worker] Price alert check completed. Successfully sent ${sentCount} emails.`);
    console.log("----------------------------------------");
  } catch (err) {
    console.error("[Worker] Fatal error in checkAndSendPriceAlerts:", err);
  }
}
