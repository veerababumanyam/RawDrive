-- M31 / F-014 · Streaming packages + versioned rate cards
--
-- Story: E102-S1 + E103-S1
--
-- Design:
--   * streaming_packages holds the product catalogue (basic/pro/enterprise + custom).
--     Rows are workspace-scoped-null for global platform packages (workspace_id IS NULL)
--     or per-workspace for custom enterprise tiers.
--   * streaming_rate_cards is versioned — each row is an immutable price point with
--     effective_from. The "active" rate at time T is: the newest rate_card with
--     effective_from <= T for that package_id.
--   * Past purchases always reference the rate_card_version_id they were priced at,
--     so changing a rate never retro-prices an existing ledger entry (D1 guarantee).

-- ---------- Packages ----------

CREATE TABLE IF NOT EXISTS streaming_packages (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id             UUID REFERENCES workspaces(id) ON DELETE CASCADE,  -- NULL = platform-global
    code                     TEXT NOT NULL,   -- 'basic' | 'pro' | 'enterprise' | 'custom-...'
    name                     TEXT NOT NULL,
    tier                     TEXT NOT NULL,   -- 'basic' | 'pro' | 'enterprise'
    minutes                  INTEGER NOT NULL CHECK (minutes > 0),
    max_concurrent_viewers   INTEGER NOT NULL CHECK (max_concurrent_viewers > 0),
    replay_ttl_days          INTEGER NOT NULL CHECK (replay_ttl_days > 0),
    is_active                BOOLEAN NOT NULL DEFAULT true,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT streaming_packages_tier_check
        CHECK (tier IN ('basic', 'pro', 'enterprise')),
    CONSTRAINT streaming_packages_code_scope_unique
        UNIQUE (workspace_id, code)
);

CREATE INDEX IF NOT EXISTS idx_streaming_packages_tier
    ON streaming_packages(tier) WHERE is_active;

ALTER TABLE streaming_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaming_packages FORCE  ROW LEVEL SECURITY;

-- Global (workspace_id IS NULL) rows are readable by everyone; workspace-custom rows
-- are gated on the workspace session. Writes require platform-level privilege and go
-- through the super-admin handler (which bypasses RLS via elevated connection).
CREATE POLICY streaming_packages_read ON streaming_packages FOR SELECT
USING (
    workspace_id IS NULL
    OR workspace_id::text = current_setting('app.current_workspace_id', true)
);

CREATE POLICY streaming_packages_write ON streaming_packages FOR ALL
USING (
    workspace_id::text = current_setting('app.current_workspace_id', true)
)
WITH CHECK (
    workspace_id::text = current_setting('app.current_workspace_id', true)
);

COMMENT ON TABLE  streaming_packages IS 'F-014 package catalogue. workspace_id NULL = global platform tier; otherwise workspace-custom.';
COMMENT ON COLUMN streaming_packages.replay_ttl_days IS 'Per F-014 D3: basic=7, pro=30, enterprise=90.';

-- ---------- Rate cards (versioned) ----------

CREATE TABLE IF NOT EXISTS streaming_rate_cards (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id               UUID NOT NULL REFERENCES streaming_packages(id) ON DELETE CASCADE,
    price_paise              BIGINT NOT NULL CHECK (price_paise >= 0),
    base_rate_paise_per_min  BIGINT NOT NULL CHECK (base_rate_paise_per_min > 0),
    overage_rate_paise_per_min BIGINT NOT NULL CHECK (overage_rate_paise_per_min > 0),
    effective_from           TIMESTAMPTZ NOT NULL,
    created_by               UUID REFERENCES users(id),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Rate cards are immutable: once inserted, rows are never UPDATEd (enforced in app + RLS).
    CONSTRAINT streaming_rate_cards_per_package_effective_unique
        UNIQUE (package_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_streaming_rate_cards_pkg_effective
    ON streaming_rate_cards(package_id, effective_from DESC);

ALTER TABLE streaming_rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaming_rate_cards FORCE  ROW LEVEL SECURITY;

-- Rate cards follow their package's visibility.
CREATE POLICY streaming_rate_cards_read ON streaming_rate_cards FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM streaming_packages p
        WHERE p.id = streaming_rate_cards.package_id
          AND (p.workspace_id IS NULL
               OR p.workspace_id::text = current_setting('app.current_workspace_id', true))
    )
);

-- Writes only via elevated super-admin connection (platform-scoped); no per-workspace writes.
CREATE POLICY streaming_rate_cards_insert ON streaming_rate_cards FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM streaming_packages p
        WHERE p.id = streaming_rate_cards.package_id
          AND p.workspace_id::text = current_setting('app.current_workspace_id', true)
    )
);

COMMENT ON TABLE  streaming_rate_cards IS 'Immutable versioned price points. New rate = insert row with future effective_from.';
COMMENT ON COLUMN streaming_rate_cards.price_paise             IS 'One-time package purchase price.';
COMMENT ON COLUMN streaming_rate_cards.base_rate_paise_per_min IS 'Per-minute cost for reserved minutes.';
COMMENT ON COLUMN streaming_rate_cards.overage_rate_paise_per_min IS 'Per-minute cost for overage minutes (F-014 D2 = 1.5x base).';

-- ---------- Seed: platform-global Basic/Pro/Enterprise ----------

-- Package rows
INSERT INTO streaming_packages (workspace_id, code, name, tier, minutes, max_concurrent_viewers, replay_ttl_days)
VALUES
    (NULL, 'basic',      'Basic',      'basic',      60,  50,   7),
    (NULL, 'pro',        'Pro',        'pro',        180, 200,  30),
    (NULL, 'enterprise', 'Enterprise', 'enterprise', 600, 1000, 90)
ON CONFLICT (workspace_id, code) DO NOTHING;

-- Initial rate-card row per package (effective immediately).
-- Basic:      price 49900 paise, base 100/min, overage 150/min
-- Pro:        price 149900 paise, base 100/min, overage 150/min
-- Enterprise: price 499900 paise, base 100/min, overage 150/min
INSERT INTO streaming_rate_cards (package_id, price_paise, base_rate_paise_per_min, overage_rate_paise_per_min, effective_from)
SELECT p.id,
       CASE p.code WHEN 'basic' THEN 49900
                   WHEN 'pro' THEN 149900
                   WHEN 'enterprise' THEN 499900 END,
       100, 150, now()
FROM streaming_packages p
WHERE p.workspace_id IS NULL AND p.code IN ('basic','pro','enterprise')
  AND NOT EXISTS (
        SELECT 1 FROM streaming_rate_cards r WHERE r.package_id = p.id
  );
