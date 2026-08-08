export const defaultSettings = {
  logoText: "Sasta.pk",
  heroSubtitle: "Search once, compare instantly across Pakistan's top stores.",
  heroQuotes: [
    "Same phone. Different price. Find out which store is lying.",
    "Compare first. Regret nothing.",
    "Why pay more for the exact same box?",
  ],
  footerText:
    "Sasta.pk — prices are pulled directly from each store and may change without notice.",
  theme: {
    brandColor: "#0B6E4F",
    accentColor: "#E8A33D",
    fontDisplay: "Space Grotesk",
    fontBody: "Inter",
  },
  cardFeatures: {
    showRating: true,
    showDiscountBadge: true,
    showOriginalPrice: true,
    showUpdatedAt: true,
    showOutOfStock: true,
    showTitle: true,
    showSpecs: true,
    showImage: true,
  },
  emailBody: "<div style=\"font-family: Arial, sans-serif; background-color: #F7F5EF; padding: 20px; color: #17231D;\">\n  <div style=\"max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #E7E1D2; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);\">\n    \n    <!-- Header Logo / Brand -->\n    <h2 style=\"font-family: 'Space Grotesk', sans-serif; color: #0B6E4F; margin-top: 0; margin-bottom: 20px;\">\n      Sasta<span style=\"color: #E8A33D;\">.pk</span> Price Drop Alert\n    </h2>\n    \n    <p style=\"font-size: 15px; line-height: 1.5; color: #17231D;\">\n      Hello,\n    </p>\n    \n    <p style=\"font-size: 15px; line-height: 1.5; color: #17231D;\">\n      Great news! The price for <strong>{product_title}</strong> at <strong>{store_name}</strong> has dropped.\n    </p>\n\n    <!-- Price Box -->\n    <div style=\"background: #F1ECDE; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center;\">\n      <span style=\"font-size: 13px; color: #6B7A70; display: block; text-transform: uppercase;\">New Price</span>\n      <span style=\"font-family: 'Space Grotesk', sans-serif; font-size: 24px; font-weight: 700; color: #0B6E4F;\">{current_price}</span>\n      <div style=\"font-size: 12px; color: #6B7A70; margin-top: 4px;\">(Previous tracked current price: {target_price})</div>\n    </div>\n\n    <!-- Call to Action Button -->\n    <div style=\"text-align: center; margin: 30px 0;\">\n      <a href=\"{product_url}\" target=\"_blank\" style=\"background-color: #0B6E4F; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 2px 5px rgba(0,0,0,0.1);\">\n        View Deal on Store →\n      </a>\n    </div>\n\n    <p style=\"font-size: 12px; color: #6B7A70; margin-top: 30px; border-top: 1px solid #E7E1D2; padding-top: 15px; text-align: center;\">\n      You received this email because you subscribed to price drop alerts on Sasta.pk.\n    </p>\n  </div>\n</div>",
  cronSchedule: "0 */12 * * *",
  emailSubject: "🎉 Price Drop Alert for {product_title}!",
  mailerRotationMode: "round-robin",
  heroSubtitle: "Search once, compare instantly across Pakistan's top stores.",
  homeColCount: 3,
  dealsColCount: 3,
  productsPerPage: 9
};
