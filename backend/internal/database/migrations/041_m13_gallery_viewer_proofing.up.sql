-- M13: Gallery Viewer, Sharing & Proofing
-- Creates: proofing_sessions, proofing_comments, album_approvals, gallery_access_logs
-- Alters: galleries, proofing_selections, share_links

-- Proofing Sessions (named selection lists)
CREATE TABLE IF NOT EXISTS proofing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    session_type TEXT NOT NULL DEFAULT 'custom',
    created_by_name TEXT,
    created_by_email TEXT,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proofing_sessions_gallery ON proofing_sessions(gallery_id);

-- Proofing Comments (threaded, with pin coordinates)
CREATE TABLE IF NOT EXISTS proofing_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES proofing_comments(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    author_email TEXT,
    author_user_id UUID REFERENCES users(id),
    body TEXT NOT NULL,
    pin_x NUMERIC(5,2),
    pin_y NUMERIC(5,2),
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proofing_comments_asset ON proofing_comments(gallery_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_proofing_comments_parent ON proofing_comments(parent_id) WHERE parent_id IS NOT NULL;

-- Album Approvals (append-only consent ledger)
CREATE TABLE IF NOT EXISTS album_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    session_id UUID REFERENCES proofing_sessions(id),
    approved_by_name TEXT NOT NULL,
    approved_by_email TEXT NOT NULL,
    approved_by_user_id UUID REFERENCES users(id),
    version_hash TEXT NOT NULL,
    config_snapshot JSONB NOT NULL DEFAULT '{}',
    ip_address TEXT,
    user_agent TEXT,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_album_approvals_gallery ON album_approvals(gallery_id);

-- Prevent UPDATE/DELETE on album_approvals (immutable ledger)
CREATE OR REPLACE FUNCTION prevent_album_approval_mutation() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'album_approvals is append-only: UPDATE and DELETE are not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_album_approvals_no_update ON album_approvals;
CREATE TRIGGER trg_album_approvals_no_update
    BEFORE UPDATE OR DELETE ON album_approvals
    FOR EACH ROW EXECUTE FUNCTION prevent_album_approval_mutation();

-- Gallery Access Logs (append-only audit)
CREATE TABLE IF NOT EXISTS gallery_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    share_link_id UUID REFERENCES share_links(id),
    visitor_ip TEXT,
    visitor_user_agent TEXT,
    access_type TEXT NOT NULL DEFAULT 'view',
    link_type TEXT,
    visitor_name TEXT,
    visitor_email TEXT,
    visitor_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_access_logs_gallery ON gallery_access_logs(gallery_id);
CREATE INDEX IF NOT EXISTS idx_gallery_access_logs_created ON gallery_access_logs(gallery_id, created_at DESC);

-- Prevent UPDATE/DELETE on gallery_access_logs (immutable audit)
CREATE OR REPLACE FUNCTION prevent_access_log_mutation() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'gallery_access_logs is append-only: UPDATE and DELETE are not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_access_logs_no_update ON gallery_access_logs;
CREATE TRIGGER trg_access_logs_no_update
    BEFORE UPDATE OR DELETE ON gallery_access_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_access_log_mutation();

-- ALTER galleries: add M13 columns
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'private';
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS proofing_deadline TIMESTAMPTZ;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS faceid_enabled BOOLEAN NOT NULL DEFAULT false;

-- ALTER proofing_selections: add M13 columns
ALTER TABLE proofing_selections ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES proofing_sessions(id);
ALTER TABLE proofing_selections ADD COLUMN IF NOT EXISTS star_rating INTEGER;
ALTER TABLE proofing_selections ADD COLUMN IF NOT EXISTS color_label TEXT;

-- Check constraint for star_rating range (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_star_rating' AND table_name = 'proofing_selections') THEN
    ALTER TABLE proofing_selections ADD CONSTRAINT chk_star_rating CHECK (star_rating IS NULL OR (star_rating >= 1 AND star_rating <= 5));
  END IF;
END $$;

-- Check constraint for access_mode enum (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_gallery_access_mode' AND table_name = 'galleries') THEN
    ALTER TABLE galleries ADD CONSTRAINT chk_gallery_access_mode CHECK (access_mode IN ('invite-only', 'private', 'unlisted', 'public'));
  END IF;
END $$;

-- ALTER share_links: add M13 columns
ALTER TABLE share_links ADD COLUMN IF NOT EXISTS max_access_count INTEGER;
ALTER TABLE share_links ADD COLUMN IF NOT EXISTS access_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE share_links ADD COLUMN IF NOT EXISTS password_hash TEXT;
