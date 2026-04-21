-- M41 / Upload Credit Top-up — 102: upload_packages + upload_rate_cards
--
-- Catalogue + pricing schema for the credit-addition surface. Ships the three
-- launch tiers from PRD §D1 as seed data so GET /api/v1/uploads/packages has
-- something to return from day one. Rate cards are effective-dated so future
-- price changes append rather than overwrite — keeps historical purchase
-- receipts auditable against the rate card that was active when they occurred.
--
-- Split reasoning (vs. a single upload_packages with price columns):
--   * credits are contract (a starter pack is always 500 credits — renaming
--     it to 600 would be a product decision, not a price change).
--   * price_paise is revenue-sensitive and may vary by market, promotion,
--     currency, or regulatory classification (GST). Keeping it on a separate
--     effective-dated row means we never mutate a historical price in place.

-- 1. Packages — canonical credit bundle definitions.
CREATE TABLE IF NOT EXISTS upload_packages (
    code          TEXT PRIMARY KEY,
    credits       BIGINT NOT NULL CHECK (credits > 0),
    display_name  TEXT   NOT NULL,
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT upload_packages_code_not_empty CHECK (length(code) > 0)
);

COMMENT ON TABLE upload_packages IS
    'M41 Upload Credit Top-up: canonical credit bundle catalogue. One row per tier (starter/pro/studio).';

CREATE INDEX IF NOT EXISTS upload_packages_active_idx
    ON upload_packages (active) WHERE active = TRUE;

-- 2. Rate cards — effective-dated price-per-package rows.
--    effective_to NULL means "currently active". Inserting a new rate card
--    for an existing package should UPDATE the prior row's effective_to in
--    a single tx so exactly one rate card is active at any time per package.
CREATE TABLE IF NOT EXISTS upload_rate_cards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_code    TEXT NOT NULL REFERENCES upload_packages(code) ON DELETE RESTRICT,
    price_paise     BIGINT NOT NULL CHECK (price_paise >= 0),
    currency        TEXT NOT NULL DEFAULT 'INR',
    effective_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_to    TIMESTAMPTZ NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT upload_rate_cards_effective_range
        CHECK (effective_to IS NULL OR effective_to > effective_from)
);

COMMENT ON TABLE upload_rate_cards IS
    'M41 Upload Credit Top-up: effective-dated price per package. Exactly one active row per package_code at a time (effective_to IS NULL).';

-- Partial unique index: only one ACTIVE (effective_to IS NULL) rate card per
-- package at a time. Historical rows are allowed to overlap in effective_from
-- but must close their effective_to before a new active card is inserted.
CREATE UNIQUE INDEX IF NOT EXISTS upload_rate_cards_active_uniq
    ON upload_rate_cards (package_code) WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS upload_rate_cards_lookup_idx
    ON upload_rate_cards (package_code, effective_from DESC);

-- 3. Seeds — three launch tiers per PRD §D1.
--    credits: starter=500, pro=2000, studio=8000.
--    price_paise: starter=29_900 (₹299), pro=149_900 (₹1499), studio=349_900 (₹3499).
--    Seeds are idempotent — re-applying the migration is a no-op.
INSERT INTO upload_packages (code, credits, display_name, active) VALUES
    ('starter', 500,  'Starter — 500 credits',  TRUE),
    ('pro',     2000, 'Pro — 2,000 credits',     TRUE),
    ('studio',  8000, 'Studio — 8,000 credits',  TRUE)
ON CONFLICT (code) DO NOTHING;

-- M41-DB-001: Explicit partial-index inference so the conflict target is
-- unambiguous. Postgres cannot reference a partial unique index via
-- `ON CONFLICT ON CONSTRAINT <name>` — the index predicate must be named
-- inline. `ON CONFLICT (package_code) WHERE effective_to IS NULL` tells the
-- planner to infer the `upload_rate_cards_active_uniq` index specifically,
-- rather than falling back to any compatible unique constraint.
INSERT INTO upload_rate_cards (package_code, price_paise, currency, effective_from, effective_to)
SELECT v.package_code, v.price_paise, 'INR', now(), NULL
FROM (VALUES
    ('starter', 29900::BIGINT),
    ('pro',     149900::BIGINT),
    ('studio',  349900::BIGINT)
) AS v(package_code, price_paise)
ON CONFLICT (package_code) WHERE effective_to IS NULL DO NOTHING;
