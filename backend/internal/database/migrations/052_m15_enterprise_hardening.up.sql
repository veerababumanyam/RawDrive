-- M15: Enterprise hardening for PWA, Security & AI
-- Adds: granular consent types, consent version hashing, workspace AI/EXIF settings,
--       audit log immutability, content report reasons, near-dupe review state
-- Reference: _cobolt-output/latest/build/M15/M15-design-decisions.md

-- ─────────────────────────────────────────────────────────────
-- 1. Consent model: 8-toggle granular + version hashing
-- ─────────────────────────────────────────────────────────────

-- Version hash column (SHA-256 of the exact consent text shown to the user)
ALTER TABLE consent_records
    ADD COLUMN IF NOT EXISTS consent_version_hash TEXT;

-- User agent (required for DPDP audit trail)
ALTER TABLE consent_records
    ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Legal basis: defaults to 'consent' but allows 'contract', 'legal_obligation', etc.
ALTER TABLE consent_records
    ADD COLUMN IF NOT EXISTS legal_basis TEXT NOT NULL DEFAULT 'consent';

-- Index on (gallery, email, type) so we can look up latest state per visitor per purpose
CREATE INDEX IF NOT EXISTS idx_consent_records_lookup
    ON consent_records(gallery_id, visitor_email, consent_type, created_at DESC);

-- NOTE: We intentionally do NOT add a CHECK constraint on consent_type.
-- The service layer (consent_service.go) validates against the allowed set so we can
-- evolve the enum without a blocking migration.

-- ─────────────────────────────────────────────────────────────
-- 2. Workspace settings: AI pick weights + EXIF policy + near-dupe
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspaces') THEN
        ALTER TABLE workspaces
            ADD COLUMN IF NOT EXISTS ai_pick_weights JSONB
                NOT NULL
                DEFAULT '{"sharpness":0.20,"blink":0.25,"expression":0.35,"composition":0.20}'::jsonb;

        ALTER TABLE workspaces
            ADD COLUMN IF NOT EXISTS exif_strip_policy TEXT
                NOT NULL
                DEFAULT 'print_safe'
                CHECK (exif_strip_policy IN ('privacy', 'print_safe', 'aggressive', 'custom'));

        ALTER TABLE workspaces
            ADD COLUMN IF NOT EXISTS exif_custom_allowlist JSONB DEFAULT '[]'::jsonb;

        ALTER TABLE workspaces
            ADD COLUMN IF NOT EXISTS near_dupe_threshold INT
                NOT NULL
                DEFAULT 8
                CHECK (near_dupe_threshold BETWEEN 5 AND 12);
    END IF;
END$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Audit log immutability (GAL-FR-172)
-- Enforced via a trigger that rejects UPDATE and DELETE on gallery_access_logs.
-- A REVOKE-based approach would require a dedicated role we cannot guarantee
-- in dev/CI environments; the trigger works everywhere.
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gallery_access_logs') THEN
        -- Create the enforcement function once
        EXECUTE $fn$
        CREATE OR REPLACE FUNCTION enforce_audit_log_append_only()
        RETURNS trigger AS $body$
        BEGIN
            RAISE EXCEPTION 'gallery_access_logs is append-only (GAL-FR-172 immutable audit)';
        END;
        $body$ LANGUAGE plpgsql;
        $fn$;

        DROP TRIGGER IF EXISTS trg_gallery_access_logs_no_update ON gallery_access_logs;
        CREATE TRIGGER trg_gallery_access_logs_no_update
            BEFORE UPDATE OR DELETE ON gallery_access_logs
            FOR EACH ROW EXECUTE FUNCTION enforce_audit_log_append_only();
    END IF;
END$$;

-- ─────────────────────────────────────────────────────────────
-- 4. Near-duplicate review state (GAL-FR-143)
-- The burst_groups table from migration 043 captures bursts; this tracks
-- the photographer's keep/hide/delete review decisions per duplicate pair.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS near_duplicate_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    burst_group_id UUID REFERENCES burst_groups(id) ON DELETE SET NULL,
    primary_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    duplicate_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    hamming_distance INT NOT NULL CHECK (hamming_distance >= 0),
    decision TEXT CHECK (decision IN ('keeper', 'hidden', 'deleted')),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(primary_asset_id, duplicate_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_near_dupes_gallery_pending
    ON near_duplicate_reviews(gallery_id)
    WHERE decision IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 5. Content flag reasons: tighten the free-form reason column
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
    -- Only add the constraint if it doesn't already exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'content_flags_reason_check'
    ) THEN
        ALTER TABLE content_flags
            ADD CONSTRAINT content_flags_reason_check
            CHECK (reason IN (
                'inappropriate', 'copyright', 'spam',
                'harassment', 'privacy', 'other'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'content_flags_status_check'
    ) THEN
        ALTER TABLE content_flags
            ADD CONSTRAINT content_flags_status_check
            CHECK (status IN (
                'pending', 'reviewed', 'action_taken', 'dismissed'
            ));
    END IF;
END$$;

-- Index for admin moderation queue ordered by report volume
CREATE INDEX IF NOT EXISTS idx_content_flags_pending_created
    ON content_flags(created_at DESC)
    WHERE status = 'pending';

-- ─────────────────────────────────────────────────────────────
-- 6. Asset AI pick score breakdown (GAL-FR-144, 145)
-- Stores the per-dimension scores so photographers can see WHY a photo was picked.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_score_breakdown JSONB;
-- Shape: {"sharpness": 0.82, "blink": 0.95, "expression": 0.77, "composition": 0.64}

-- ─────────────────────────────────────────────────────────────
-- 7. PWA install telemetry (GAL-NFR-001)
-- Records when a visitor installs the gallery as a PWA so studios can see adoption.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pwa_install_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    visitor_hash TEXT NOT NULL,
    platform TEXT,
    user_agent TEXT,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pwa_installs_gallery
    ON pwa_install_events(gallery_id, installed_at DESC);
