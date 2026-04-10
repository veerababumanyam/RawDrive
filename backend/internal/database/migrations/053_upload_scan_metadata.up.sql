-- M16 E47-S5: Upload scan metadata columns on assets
-- Enables the client-side upload abuse screening flow (Tier D) to persist
-- manifest verdicts, findings, and the policy version that produced them.
-- Reference: _cobolt-output/latest/planning/feature-architecture-delta.md §6.1

ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS upload_scan_status          TEXT,
    ADD COLUMN IF NOT EXISTS upload_scan_engine          TEXT,
    ADD COLUMN IF NOT EXISTS upload_scan_policy_version  TEXT,
    ADD COLUMN IF NOT EXISTS upload_scan_risk_score      NUMERIC(3,2),
    ADD COLUMN IF NOT EXISTS upload_scan_findings        JSONB,
    ADD COLUMN IF NOT EXISTS upload_scan_manifest_hash   TEXT;

-- Partial index so the moderation dashboard (E50-S1) can list blocked / needs_desktop
-- items per workspace without scanning the full assets table.
CREATE INDEX IF NOT EXISTS idx_assets_scan_status_blocked
    ON assets (workspace_id, upload_scan_status, created_at DESC)
    WHERE upload_scan_status IN ('blocked', 'needs_desktop');

-- NOTE: We intentionally do NOT add a CHECK constraint on upload_scan_status.
-- The service layer (upload_manifest_validation.go) validates against the allowed
-- set so we can evolve the enum without a blocking migration. Allowed values:
-- 'passed', 'blocked', 'needs_desktop', 'override', null (not yet scanned).
