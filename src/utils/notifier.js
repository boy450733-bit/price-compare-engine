import nodemailer from "nodemailer";
import { pool } from "../db/client.js";

export async function checkAndSendPriceAlerts() {
  console.log("----------------------------------------");
  console.log("[Worker] Running dynamic price alert check worker...");
  
  try {
    const settingsRes = await pool.query("SELECT data FROM site_settings WHERE id = 1");
    const settings = settingsRes.rows[0]?.data || {};
    const alertsConfig = settings.alertsConfig || {};

    let mailers = alertsConfig.mailers || [];
    console.log(`[Worker] Found ${mailers.length} mailer profiles in database settings.`);
    
    if (mailers.length === 0) {
      mailers = [{
        name: "Default Mailer",
        type: "smtp",
        host: alertsConfig.mailServer || process.env.MAIL_SERVER || "smtp.resend.com",
        port: parseInt(alertsConfig.mailPort || process.env.MAIL_PORT || "587", 10),
        secure: false,
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

    function getNextMailerConfig() {
      if (activeMailers.length === 0) return null;
      
      let config;
      if (rotationMode === "random") {
        config = activeMailers[Math.floor(Math.random() * activeMailers.length)];
      } else {
        config = activeMailers[mailerIndex % activeMailers.length];
        mailerIndex++;
      }
      return config;
    }

    const subjectTemplate = alertsConfig.emailSubject || "🎉 Price Drop Alert for {product_title}!";
    const bodyTemplate = alertsConfig.emailBody || "Hello,\n\nGood news! The price for {product_title} has dropped to {target_price}.\n\nCheck it out here: {product_url}";

    const alertsRes = await pool.query(`
      SELECT a.id, a.email, a.target_price, p.id AS product_id, p.title AS product_title, p.price AS current_price, p.url AS product_url, p.store AS store_name
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

      // Grab siteUrl from your settings JSON (with an environment fallback)
      const siteUrl = settings.siteUrl || process.env.SITE_URL || "https://sasta.pk";

      // Build the tracked affiliate route dynamically using /out/
      const affiliateRouteUrl = `${siteUrl}/out?id=${alert.product_id}`;

      const body = bodyTemplate
        .replace(/{product_title}/g, alert.product_title || "Product")
        .replace(/{target_price}/g, alert.target_price ? `Rs ${Number(alert.target_price).toLocaleString()}` : "N/A")
        .replace(/{current_price}/g, alert.current_price ? `Rs ${Number(alert.current_price).toLocaleString()}` : "N/A")
        .replace(/{store_name}/g, alert.store_name || "Store")
        .replace(/{product_url}/g, affiliateRouteUrl);

      let sentSuccessfully = false;
      let attempts = 0;
      const maxAttempts = activeMailers.length;

      while (!sentSuccessfully && attempts < maxAttempts) {
        const config = getNextMailerConfig();
        if (!config) break;

        const mailerName = config.name || "Mailer";
        console.log(`[Attempt] Trying mailer: "${mailerName}" (Type: ${config.type || "smtp"})`);

        if (!config.password) {
          console.error(`[Error] [${mailerName}] API key / password is missing.`);
          attempts++;
          continue;
        }

        try {
          // Check if protocol type is HTTP API
          if (config.type === "api" || (config.host && config.host.toLowerCase().includes("resend.com") && !config.type)) {
            console.log(`[API] Using Resend HTTP REST API (Port 443) for "${mailerName}"...`);
            
            const response = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${config.password}`
              },
              body: JSON.stringify({
                from: config.sender || "Sasta.pk <onboarding@resend.dev>",
                to: [alert.email],
                subject: subject,
                html: body // Use html property instead of text
              })
            });

            const resData = await response.json();
            if (!response.ok) {
              throw new Error(resData.message || JSON.stringify(resData));
            }

            console.log(`[Success] [${mailerName}] Email sent via Resend API! ID: ${resData.id}`);
          } else {
            // Standard SMTP Transport via Nodemailer
            const transporter = nodemailer.createTransport({
              host: config.host,
              port: parseInt(config.port, 10) || 587,
              secure: config.secure,
              auth: { user: config.username, pass: config.password },
              connectionTimeout: 10000,
              socketTimeout: 10000
            });

            const info = await transporter.sendMail({
              from: config.sender || '"Sasta.pk" <noreply@sasta.pk>',
              to: alert.email,
              subject: subject,
              html: body, // Use html property instead of text
            });

            console.log(`[Success] [${mailerName}] SMTP Message sent: ${info.messageId}`);
          }

          await pool.query("UPDATE price_alerts SET notified = true WHERE id = $1", [alert.id]);
          sentCount++;
          sentSuccessfully = true;
        } catch (emailErr) {
          attempts++;
          console.error(`[Error] [${mailerName}] Failed to send alert: ${emailErr.message}`);
          
          if (rotationMode !== "fallback") {
            break; 
          }
          console.log(`[Worker] Falling back to next dynamic mailer...`);
        }
      }
    }

    console.log(`[Worker] Price alert check completed. Successfully sent ${sentCount} emails.`);
    console.log("----------------------------------------");
  } catch (err) {
    console.error("[Worker] Fatal error in checkAndSendPriceAlerts:", err);
  }
}
