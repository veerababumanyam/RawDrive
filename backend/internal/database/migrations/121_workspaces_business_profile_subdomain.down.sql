-- 121: rollback business profile subdomain columns + constraints + indexes.

BEGIN;

DROP INDEX IF EXISTS idx_workspaces_business_full_subdomain;
DROP INDEX IF EXISTS idx_workspaces_business_unique_code;

ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS business_unique_code_shape;
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS business_profile_slug_valid_label;

ALTER TABLE workspaces
  DROP COLUMN IF EXISTS business_unique_code,
  DROP COLUMN IF EXISTS business_profile_slug;

COMMIT;
