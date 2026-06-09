BEGIN;

DROP INDEX IF EXISTS gallery_workspace_shares_billed_workspace_idx;
DROP INDEX IF EXISTS gallery_workspace_shares_shared_workspace_idx;
DROP INDEX IF EXISTS gallery_workspace_shares_gallery_idx;
DROP INDEX IF EXISTS gallery_workspace_shares_active_uniq;
DROP TABLE IF EXISTS gallery_workspace_shares;

COMMIT;
