# 🛍️ Sasta.pk

A multi-store price comparison engine for Pakistani e-commerce. Scrapes live prices on demand across multiple stores, matches products across vendors using a brand/category/spec-based intelligence pipeline, tracks affiliate click-throughs, and ships with a token-protected admin panel for managing stores, affiliate links, and site branding — no code changes required for day-to-day operation.

---

## ✨ Current Features

**Search & scraping**
- Search-first, scrape-on-demand architecture — a query hits a Postgres cache first; a background job only re-scrapes live stores when the cache is stale or thin, instead of crawling full catalogs
- Config-driven store adapters — new stores are added as small config objects (search URL + CSS selectors), not one-off scraper scripts; supports both HTML (Cheerio) and JSON-API-backed stores (e.g. Daraz), plus GET/POST requests for endpoints that reject one or the other
- Redis + BullMQ job queue for scraping, decoupled from the API's request/response cycle

**Product intelligence**
- Brand/model/category detection and spec extraction (RAM, storage, battery, display, CPU/GPU, color) from raw scraped titles
- Cross-store fingerprinting to identify the same physical product across different vendors
- Relevance scoring against the search query to filter out mismatched results (e.g. accessories showing up in a phone search)

**Affiliate management**
- Click tracking with a unique reference per click, for reconciling network-reported conversions
- Manual affiliate-link workflow for stores with no bulk/API tracking tool — a prioritized worklist (by click volume) plus a one-command way to save a converted link
- Per-store affiliate parameter support for stores that do support simple tracking-URL parameters

**Admin panel** (`/admin.html`, token-protected)
- Dashboard with basic usage stats
- Store config: enable/disable stores, edit badge colors and affiliate params, with filtering for long store lists
- Affiliate tab: pending worklist + review/edit of already-linked products
- Site Settings: branding (logo, hero copy, footer), theme (colors, fonts), and per-field toggles for what shows on product cards (rating, discount badge, original price, stock status, last-updated time)
- Persistent login (stays signed in across visits) with a manual log-out option

**Storefront**
- Single-page, dependency-light frontend (vanilla JS, no build step) with store/price/stock filters and sort options
- Fully theme-able from the admin panel without touching code

---

## 🛠 Tech Stack

- **Backend:** Node.js (ESM), Express
- **Database:** PostgreSQL (`pg`), with `pg_trgm` for fuzzy search
- **Queue:** Redis + BullMQ
- **Scraping:** Cheerio (HTML), native `fetch` (JSON APIs)
- **Frontend:** Vanilla JavaScript, CSS custom properties (no framework, no build step)
- **Deployment:** Railway (Dockerfile included; runs anywhere Docker does)

---

## ⚙️ Environment Variables

Create a `.env` file in the project root (see `.env.example`):

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/price_compare
REDIS_URL=redis://localhost:6379
PORT=3000
CACHE_STALE_HOURS=12
CACHE_MIN_STORE_COUNT=3
ADMIN_TOKEN=change-this-to-a-long-random-string
```

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string, used by the BullMQ scrape queue |
| `PORT` | Port the Express server listens on |
| `CACHE_STALE_HOURS` | How old cached results can be before a search triggers a re-scrape |
| `CACHE_MIN_STORE_COUNT` | Minimum distinct stores required in cached results before skipping a re-scrape |
| `ADMIN_TOKEN` | Shared secret for `/admin/api/*` — required, the server refuses admin requests without it configured |

---

## 📦 Installation & Setup

```bash
git clone https://github.com/your-username/price-compare-engine.git
cd price-compare-engine
cp .env.example .env   # then edit with real values
npm install
```

Start Postgres + Redis locally (or point `.env` at hosted instances), then:

```bash
npm run migrate   # applies src/db/schema.sql
npm run seed      # registers initial stores
```

Run the API and the scrape worker as **two separate processes**:

```bash
npm run dev       # API server, auto-reload
npm run worker    # scrape queue worker — required for search results to ever populate
```

> In production, the `api` service auto-applies the schema and seeds stores/settings on boot — `npm run migrate`/`npm run seed` are mainly for local dev and one-off fixes.

---

## 🗂 Project Structure

```
src/
├── adapters/          # store adapter factory + per-store configs
│   ├── createAdapter.js
│   ├── generic.js
│   ├── index.js
│   └── stores/        # one config file per store
├── config/            # shared defaults (e.g. site settings)
├── db/                # schema.sql, connection client
├── intelligence/      # brand/category/spec extraction, fingerprinting, relevance scoring
├── queue/             # BullMQ queue + worker
├── routes/            # search, stores, redirect, settings, admin
├── scraper/           # orchestrates adapters + intelligence pipeline → DB
└── server.js
public/
├── index.html         # storefront
└── admin.html         # admin panel
scripts/                # migrate, seed, affiliate worklist/link CLI tools
```

---

## 🔧 Admin Panel

Visit `/admin.html` and enter your `ADMIN_TOKEN`. Session persists across visits (stored client-side) until you explicitly log out.

- **Store Config** — toggle stores on/off, edit colors/affiliate params, filter a long list by name
- **Affiliate → Pending** — products that have been clicked but have no tracked link yet, sorted by click volume
- **Affiliate → Already Linked** — review/edit existing links inline
- **Site Settings** — logo text, hero copy, footer, theme colors/fonts, and which optional fields show on product cards
- **Add New Stores** — No coding requirements, just add as many as you need from admin panel

That's the whole process — no changes needed to the scraper, queue, API routes, or frontend.

---

## 🚀 Deployment

Ships with a `Dockerfile` and `docker-compose.prod.yml`. Deployed reference target is Railway (`api` + `worker` as separate services, managed Postgres + Redis plugins) — see `DEPLOY.md` for step-by-step instructions, including Firebase/Cloud Run as an alternative.

---

## 🛣 Roadmap

Planned, not yet built — listed here deliberately instead of under "Features" above:

- [ ] Cross-store product grouping in search results using the existing `fingerprint` column (currently computed and stored, but search still returns individual listings rather than grouped "same product, N store offers" cards)
- [ ] JSON-LD structured-data extraction as a preferred data source over CSS-selector scraping, where a store provides it
- [ ] Shopify/WooCommerce generic platform adapters, for faster onboarding of stores beyond the current custom per-site configs
- [ ] Price-drop email alerts (would need a mailer integration — not present yet)
- [ ] Scheduled/cron re-scraping of trending queries, instead of purely on-demand
- [ ] HttpOnly cookie-based admin session (currently a bearer token in client-side storage — functional, but a cookie-based session would be a meaningful security upgrade)
- [ ] Admin analytics charts
- [ ] Browser extension / mobile app

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Open a Pull Request

---

## 📄 License

MIT
