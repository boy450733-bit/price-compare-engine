Sasta.pk 🛍️
A lightning-fast, production-ready multi-store price comparison and tracking engine built with Node.js, Express, PostgreSQL, and Vanilla JavaScript. It scrapes real-time deals, caches product metadata, monitors price drop alerts via multi-mailer pools (SMTP & HTTP APIs), and features a secure administrative dashboard.

🚀 Key Features
Live Multi-Store Scrapers: Dynamic HTML parsing and extraction engines supporting multiple e-commerce vendors with customizable selector blocks.

Smart Affiliate Link Management: Automatic tracking conversion pipeline with a dedicated worklist for unlinked high-traffic products.

Price Drop Alert Engine: Automated background cron runner supporting multi-mailer round-robin rotation, randomized selection, and sequential fallback mechanisms.

Hybrid Mailer Gateway (SMTP & HTTP REST API): Built-in support for standard SMTP protocols alongside cloud-native HTTPS REST APIs (such as Resend on Port 443) to completely bypass hosting provider port blocks.

Interactive Admin GUI: Secured administrative panel featuring live scraper sandboxes, chart analytics (powered by Chart.js), token authentication via secure HttpOnly cookies, and granular site/template customization.

🛠️ Tech Stack
Backend: Node.js, Express, Nodemailer, Node-Cron

Database: PostgreSQL (pg connection pooling)

Frontend: Vanilla JavaScript, CSS3 (Custom Properties / Design Tokens), Chart.js

Security: HttpOnly Session Cookies, Token-based Administrative Gate

⚙️ Environment Variables
Create a .env file in the root directory and configure the following variables:

Code snippet
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/sastapk
ADMIN_TOKEN=your_secure_admin_token_here
SITE_URL=https://sasta.pk
📦 Installation & Setup
Clone the repository:

Bash
git clone https://github.com/your-username/sasta-pk.git
cd sasta-pk
Install dependencies:

Bash
npm install
Configure your database:
Ensure your PostgreSQL instance is running and execute your schema migration script.

Start the application:

Development mode (with auto-reload):

Bash
npm run dev
Production mode:

Bash
npm start
🔧 Administrative Dashboard
Access the administrative interface at /admin.html.

Authentication: Enter your secure ADMIN_TOKEN defined in your environment variables to issue an HttpOnly secure session cookie.

Store Config: Test scraping payloads and selectors live using the built-in Scraper Sandbox.

Mailer Settings: Configure multiple mailer profiles, toggle between Standard SMTP and HTTP API Mode (Port 443), and select your distribution strategy (Round-Robin, Random, or Sequential Fallback).

Price Drop Alerts: Customize HTML notification templates using dynamic tags like {product_title}, {target_price}, {current_price}, {store_name}, and {product_url} (which automatically routes clicks through your /out?id= affiliate tracking endpoint).

📄 License
This project is licensed under the MIT License.
