-- Down for migration 150.
--
-- Reverts only the metadata label/default to the historical value. This does
-- not change where objects are stored.

BEGIN;

ALTER TABLE assets
    ALTER COLUMN storage_driver SET DEFAULT 'r2';

UPDATE assets
SET storage_driver = 'r2',
    updated_at = now()
WHERE storage_driver = 's3';

COMMIT;
