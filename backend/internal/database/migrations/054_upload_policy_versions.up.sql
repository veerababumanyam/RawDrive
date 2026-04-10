-- M16 E47-S5: Upload screening policy version catalog
-- Super-admins publish new policy versions here. Manifests whose policy_version
-- is missing from this table, past max_age_days, or has revoked_at set are rejected.
-- Reference: _cobolt-output/latest/planning/feature-architecture-delta.md §6.2

CREATE TABLE IF NOT EXISTS upload_policy_versions (
    policy_version  TEXT PRIMARY KEY,
    policy_json     JSONB NOT NULL,
    published_at    TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ NULL,
    max_age_days    INTEGER NOT NULL DEFAULT 90,
    notes           TEXT NULL
);

-- Partial index on active (non-revoked) versions — the validator hot path only
-- cares about active entries, so this keeps lookups sub-millisecond.
CREATE INDEX IF NOT EXISTS idx_upload_policy_versions_active
    ON upload_policy_versions (policy_version)
    WHERE revoked_at IS NULL;

-- Seed the initial policy version so the browser worker and backend agree
-- on a starting point from day one of M16.
INSERT INTO upload_policy_versions (policy_version, policy_json, published_at, max_age_days, notes)
VALUES (
    'upload-screening/2026-04-10',
    '{"version": "2026-04-10", "browser_formats": ["jpeg","png","webp","gif"], "metadata_budget_bytes": 524288, "text_chunk_budget_bytes": 262144}'::jsonb,
    NOW(),
    90,
    'Initial M16 policy — browser preflight for common web formats; strict modes fail-closed on TIFF/HEIC/RAW until M17 ships.'
)
ON CONFLICT (policy_version) DO NOTHING;
