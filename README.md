# Price Compare Engine

Search-first, scrape-on-demand price comparison backbone (Flashi.pk-style architecture).

## How it works

1. User searches a product → API checks Postgres cache (`GET /api/products?q=...`).
2. If cache is fresh and has enough store coverage, results return immediately.
3. If cache is thin/stale, a scrape job is queued (BullMQ + Redis) and the response
   includes `needsLiveScrape: true` so the frontend knows to poll again shortly.
4. A background worker process picks up the job, runs each store's adapter
   (`src/adapters/`), and upserts fresh listings + price history into Postgres.
5. Clicking a result hits `GET /out/:productId`, which logs the click and
   redirects to the store with your affiliate tag appended.

## Setup

```bash
cp .env.example .env
docker compose up -d          # starts Postgres + Redis
npm install
npm run migrate               # applies schema.sql
npm run seed                  # registers initial stores
npm run dev                   # starts the API (terminal 1)
npm run worker                # starts the scrape worker (terminal 2)
```

Test it:

```bash
curl "http://localhost:3000/api/products?q=Xiaomi+Redmi+15c&limit=50"
```

## Adding a new store

1. Create `src/adapters/<store>.js` implementing `async (query) => RawListing[]`.
   Check the store's site for: (a) a public search/autocomplete API first,
   (b) JSON-LD structured data in the page `<head>`, (c) a sitemap, before
   falling back to raw HTML scraping.
2. Register it in `src/adapters/index.js`.
3. Add a row for it via `scripts/seed.js` (or a small admin script) with its
   `search_url_template` and `affiliate_param`.

## What's intentionally NOT built yet

- Real per-store adapters beyond the Mega.pk template — this is where most
  of your actual engineering time will go.
- Frontend — this is API-only; build the UI as a separate app that calls
  `/api/products`.
- Popular-query pre-warming cron job (scheduled re-scrape of trending
  searches) — straightforward to add once `search_log` has real data.
- Price-drop alert notifications (email/push) — the `price_history` table
  is already there to support this.
- Rate limiting / proxy rotation for scraping at scale.
