CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS stores (
  name                TEXT PRIMARY KEY,
  color               TEXT,
  base_url            TEXT NOT NULL,
  search_url_template TEXT NOT NULL,  -- use {query} placeholder
  affiliate_param     TEXT,           -- e.g. "?aff_id=YOUR_ID" appended on redirect
  enabled             BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,     -- md5(store || '|' || url)
  title           TEXT NOT NULL,
  store           TEXT NOT NULL REFERENCES stores(name),
  url             TEXT NOT NULL,
  image           TEXT,
  price           NUMERIC,
  original_price  NUMERIC,
  rating          NUMERIC DEFAULT 0,
  review_count    INTEGER DEFAULT 0,
  in_stock        BOOLEAN DEFAULT true,
  source_query    TEXT,
  scraped_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_title_trgm ON products USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_source_query ON products (source_query);
CREATE INDEX IF NOT EXISTS idx_products_store ON products (store);

CREATE TABLE IF NOT EXISTS price_history (
  id          BIGSERIAL PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price       NUMERIC,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history (product_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS clicks (
  id          BIGSERIAL PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id),
  clicked_at  TIMESTAMPTZ DEFAULT now(),
  ip_hash     TEXT
);

CREATE TABLE IF NOT EXISTS search_log (
  id         BIGSERIAL PRIMARY KEY,
  query      TEXT NOT NULL,
  store_count INTEGER,
  searched_at TIMESTAMPTZ DEFAULT now()
); -- powers "trending query" pre-warming
