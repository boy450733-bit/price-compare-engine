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
  id                 TEXT PRIMARY KEY,      -- md5(store || '|' || url)

  -- Original scraped data
  title              TEXT NOT NULL,
  url                TEXT NOT NULL,
  image              TEXT,
  store              TEXT NOT NULL REFERENCES stores(name),

  -- Pricing
  price              NUMERIC,
  original_price     NUMERIC,

  -- Reviews
  rating             NUMERIC DEFAULT 0,
  review_count       INTEGER DEFAULT 0,

  -- Availability
  in_stock           BOOLEAN DEFAULT true,

  -- Search metadata
  source_query       TEXT,
  category           TEXT,
  brand              TEXT,
  model              TEXT,
  normalized_title   TEXT,
  keywords           TEXT[],

  -- Intelligent matching
  fingerprint        TEXT,
  match_score        NUMERIC DEFAULT 0,

  -- Flexible specifications
  specs              JSONB DEFAULT '{}'::jsonb,

  -- Complete scraped object for debugging
  raw_data           JSONB DEFAULT '{}'::jsonb,

  -- Dates
  scraped_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_title_trgm
ON products USING gin(title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_source_query
ON products(source_query);

CREATE INDEX IF NOT EXISTS idx_products_store
ON products(store);

CREATE INDEX IF NOT EXISTS idx_products_brand
ON products(brand);

CREATE INDEX IF NOT EXISTS idx_products_model
ON products(model);

CREATE INDEX IF NOT EXISTS idx_products_category
ON products(category);

CREATE INDEX IF NOT EXISTS idx_products_fingerprint
ON products(fingerprint);

CREATE INDEX IF NOT EXISTS idx_products_keywords
ON products USING GIN(keywords);

CREATE INDEX IF NOT EXISTS idx_products_specs
ON products USING GIN(specs);

CREATE TABLE IF NOT EXISTS price_history (
  id          BIGSERIAL PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price       NUMERIC,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history (product_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS site_settings (
  id         INT PRIMARY KEY DEFAULT 1,
  data       JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1) -- enforces exactly one settings row
);

CREATE TABLE IF NOT EXISTS affiliate_links (
  product_id    TEXT PRIMARY KEY REFERENCES products(id),
  affiliate_url TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
); -- manually-converted links for stores with no bulk/API affiliate tool (e.g. Daraz)

CREATE TABLE IF NOT EXISTS clicks (
  id          BIGSERIAL PRIMARY KEY,
  click_ref   TEXT UNIQUE,           -- short id passed as the affiliate network's sub-id/tracking param, so network-reported sales can be matched back to this row
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

-- capture subscription email
CREATE TABLE IF NOT EXISTS price_alerts (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  target_price NUMERIC,
  notified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE stores ADD COLUMN IF NOT EXISTS selectors JSONB;