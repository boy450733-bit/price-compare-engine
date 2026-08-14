import fs from "node:fs";
import path from "node:path";
import { pool } from "../db/client.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatLogoHtml(logoText, brandColor, accentColor) {
  const rawLogoText = String(logoText || "Sasta.pk");
  let namePart = rawLogoText;
  let tldPart = "";

  const domainRegex = /^[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$|^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/;
  if (domainRegex.test(rawLogoText)) {
    const firstDotIndex = rawLogoText.indexOf(".");
    namePart = rawLogoText.substring(0, firstDotIndex);
    tldPart = rawLogoText.substring(firstDotIndex);
  } else {
    const mid = Math.floor(rawLogoText.length / 2);
    namePart = rawLogoText.substring(0, mid);
    tldPart = rawLogoText.substring(mid);
  }

  return `<span class="logo-name" style="color: ${brandColor};">${escapeHtml(namePart)}</span><span class="logo-tld" style="color: ${accentColor};">${escapeHtml(tldPart)}</span>`;
}

export async function renderPage(req, res, { templateName, routePath, extraDataFn = async () => ({}) }) {
  const publicDir = path.resolve("public");
  try {
    // Fetch shared site settings concurrently with custom page data
    const [settingResult, extraData] = await Promise.all([
      pool.query('SELECT data FROM site_settings WHERE id = 1'),
      extraDataFn(req, pool)
    ]);

    const settings = settingResult.rows[0]?.data || {};
    const theme = settings.theme || {};

    let html = fs.readFileSync(path.join(publicDir, templateName), 'utf8');

    // Build absolute canonical URL
    const baseUrl = settings.siteUrl || `${req.protocol}://${req.get('host')}`;
    const absoluteCanonical = new URL(routePath, baseUrl).href;

    // Clean up duplicate canonicals from customHead
    const customHeadContent = settings.customHead || '';

    const brandColor = theme.brandColor || "#050842";
    const accentColor = theme.accentColor || "#0905f5";
    const formattedLogoHtml = formatLogoHtml(settings.logoText, brandColor, accentColor);
    const footerText = settings.footerText || "Powered by Sasta.pk Engine";

    // Common CSS variables shared across pages
    const colCount = extraData.colCount || Number(settings.homeColCount || settings.dealsColCount) || 3;

    const inlineCss = `
      :root {
        --color-bg: ${theme.colorBg || '#F7F5EF'};
        --color-surface: ${theme.colorSurface || '#FFFFFF'};
        --color-ink: ${theme.colorInk || '#17231D'};
        --color-ink-soft: ${theme.colorInkSoft || '#6B7A70'};
        --color-brand: ${brandColor};
        --color-brand-dark: ${theme.brandDark || '#094F39'};
        --color-line: ${theme.colorLine || '#E7E1D2'};
        --color-accent: ${accentColor};
        --color-danger: ${theme.colorDanger || '#C24B3F'};
        --font-body: "${theme.fontBody || 'Inter'}", sans-serif;
        --font-display: "${theme.fontDisplay || 'Space Grotesk'}", sans-serif;
        --home-cols: ${colCount};
        --deal-cols: ${colCount};
      }
    `;

    // Handle initial client script bootstrap data if provided
    let bootstrapScript = '';
    if (extraData.initialData) {
      const serialized = Object.entries(extraData.initialData).reduce((acc, [key, val]) => {
        acc[key] = JSON.stringify(val).replace(/</g, '\\u003c');
        return acc;
      }, {});

      const assignments = Object.entries(serialized).map(([k, v]) => `\n          ${k}: ${v}`).join(',');
      bootstrapScript = `
      <script>
        window.__INITIAL_DATA__ = {${assignments}
        };
      </script>`;
    }

    // Apply Replacements
    html = html.replace('/* DB_THEME_INJECT */', inlineCss);
    html = html.replace('/* Database Theme Variables Injection Point */\n    /* DB_THEME_INJECT */', inlineCss);
    
    html = html.replace('<!-- DB_CUSTOM_HEAD_INJECT -->', customHeadContent + bootstrapScript);
    
    // Replace dynamic canonical hrefs depending on template pattern
    html = html.replace(`href="${routePath}"`, `href="${absoluteCanonical}"`);
    html = html.replace('href="/"', `href="${absoluteCanonical}"`);
    html = html.replace('href="/deals"', `href="${absoluteCanonical}"`);

    if (html.includes('<!-- DB_LOGO_INJECT -->')) {
      html = html.replace('<!-- DB_LOGO_INJECT -->', formattedLogoHtml);
    } else {
      html = html.replace(/<div class="logo" id="logoSlot">[\s\S]*?<\/div>/, `<div class="logo" id="logoSlot">${formattedLogoHtml}</div>`);
    }

    html = html.replace('<!-- DB_FOOTER_TEXT_INJECT -->', escapeHtml(footerText));

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error(`Page render error for ${routePath}:`, err);
    res.sendFile(path.join(publicDir, templateName));
  }
}