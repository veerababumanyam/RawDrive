-- M15 enterprise hardening rollback

DROP TABLE IF EXISTS pwa_install_events;

ALTER TABLE assets DROP COLUMN IF EXISTS ai_score_breakdown;

-- Drop content_flags check constraints
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints
               WHERE constraint_name = 'content_flags_reason_check') THEN
        ALTER TABLE content_flags DROP CONSTRAINT content_flags_reason_check;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints
               WHERE constraint_name = 'content_flags_status_check') THEN
        ALTER TABLE content_flags DROP CONSTRAINT content_flags_status_check;
    END IF;
END$$;

DROP INDEX IF EXISTS idx_content_flags_pending_created;

DROP TABLE IF EXISTS near_duplicate_reviews;

-- Drop audit immutability trigger + function
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gallery_access_logs') THEN
        DROP TRIGGER IF EXISTS trg_gallery_access_logs_no_update ON gallery_access_logs;
    END IF;
END$$;
DROP FUNCTION IF EXISTS enforce_audit_log_append_only();

-- Workspace settings rollback
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspaces') THEN
        ALTER TABLE workspaces DROP COLUMN IF EXISTS near_dupe_threshold;
        ALTER TABLE workspaces DROP COLUMN IF EXISTS exif_custom_allowlist;
        ALTER TABLE workspaces DROP COLUMN IF EXISTS exif_strip_policy;
        ALTER TABLE workspaces DROP COLUMN IF EXISTS ai_pick_weights;
    END IF;
END$$;

-- Consent rollback
DROP INDEX IF EXISTS idx_consent_records_lookup;

ALTER TABLE consent_records DROP COLUMN IF EXISTS legal_basis;
ALTER TABLE consent_records DROP COLUMN IF EXISTS user_agent;
ALTER TABLE consent_records DROP COLUMN IF EXISTS consent_version_hash;
