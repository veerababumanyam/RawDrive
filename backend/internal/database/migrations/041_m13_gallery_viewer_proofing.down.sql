-- Rollback M13: Gallery Viewer, Sharing & Proofing

-- Remove ALTER share_links columns
ALTER TABLE share_links DROP COLUMN IF EXISTS password_hash;
ALTER TABLE share_links DROP COLUMN IF EXISTS access_count;
ALTER TABLE share_links DROP COLUMN IF EXISTS max_access_count;

-- Remove ALTER proofing_selections columns
ALTER TABLE proofing_selections DROP CONSTRAINT IF EXISTS chk_star_rating;
ALTER TABLE proofing_selections DROP COLUMN IF EXISTS color_label;
ALTER TABLE proofing_selections DROP COLUMN IF EXISTS star_rating;
ALTER TABLE proofing_selections DROP COLUMN IF EXISTS session_id;

-- Remove ALTER galleries columns
ALTER TABLE galleries DROP CONSTRAINT IF EXISTS chk_gallery_access_mode;
ALTER TABLE galleries DROP COLUMN IF EXISTS faceid_enabled;
ALTER TABLE galleries DROP COLUMN IF EXISTS proofing_deadline;
ALTER TABLE galleries DROP COLUMN IF EXISTS access_mode;

-- Drop triggers and functions
DROP TRIGGER IF EXISTS trg_access_logs_no_update ON gallery_access_logs;
DROP FUNCTION IF EXISTS prevent_access_log_mutation();
DROP TRIGGER IF EXISTS trg_album_approvals_no_update ON album_approvals;
DROP FUNCTION IF EXISTS prevent_album_approval_mutation();

-- Drop tables (reverse creation order)
DROP TABLE IF EXISTS gallery_access_logs;
DROP TABLE IF EXISTS album_approvals;
DROP TABLE IF EXISTS proofing_comments;
DROP TABLE IF EXISTS proofing_sessions;
