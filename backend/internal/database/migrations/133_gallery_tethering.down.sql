DROP INDEX IF EXISTS idx_galleries_tethering_enabled;

ALTER TABLE galleries
  DROP COLUMN IF EXISTS tethering_enabled,
  DROP COLUMN IF EXISTS tether_directory;
