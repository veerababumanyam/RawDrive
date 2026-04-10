-- M16 E47-S5: Rollback upload scan metadata columns

DROP INDEX IF EXISTS idx_assets_scan_status_blocked;

ALTER TABLE assets
    DROP COLUMN IF EXISTS upload_scan_status,
    DROP COLUMN IF EXISTS upload_scan_engine,
    DROP COLUMN IF EXISTS upload_scan_policy_version,
    DROP COLUMN IF EXISTS upload_scan_risk_score,
    DROP COLUMN IF EXISTS upload_scan_findings,
    DROP COLUMN IF EXISTS upload_scan_manifest_hash;
