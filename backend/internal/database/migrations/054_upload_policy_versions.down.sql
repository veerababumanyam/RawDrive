-- M16 E47-S5: Rollback upload policy version catalog

DROP INDEX IF EXISTS idx_upload_policy_versions_active;
DROP TABLE IF EXISTS upload_policy_versions;
