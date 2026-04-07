-- Reverse M2 gallery alterations (restore to M1 schema: id, workspace_id, name, created_at)
DROP INDEX IF EXISTS idx_galleries_workspace_status;
DROP INDEX IF EXISTS idx_galleries_workspace_id_active;
DROP INDEX IF EXISTS idx_galleries_workspace_slug;

ALTER TABLE galleries DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE galleries DROP COLUMN IF EXISTS updated_at;
ALTER TABLE galleries DROP COLUMN IF EXISTS created_by;
ALTER TABLE galleries DROP COLUMN IF EXISTS status;
ALTER TABLE galleries DROP COLUMN IF EXISTS max_selections;
ALTER TABLE galleries DROP COLUMN IF EXISTS is_published;
ALTER TABLE galleries DROP COLUMN IF EXISTS watermark_config;
ALTER TABLE galleries DROP COLUMN IF EXISTS password_hash;
ALTER TABLE galleries DROP COLUMN IF EXISTS settings;
ALTER TABLE galleries DROP COLUMN IF EXISTS gallery_type;
ALTER TABLE galleries DROP COLUMN IF EXISTS cover_asset_id;
ALTER TABLE galleries DROP COLUMN IF EXISTS description;
ALTER TABLE galleries DROP COLUMN IF EXISTS slug;

-- Rename title back to name
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'galleries' AND column_name = 'title') THEN
    ALTER TABLE galleries RENAME COLUMN title TO name;
  END IF;
END $$;
