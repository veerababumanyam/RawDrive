-- Rollback M11 deferred features
DROP TABLE IF EXISTS edge_delivery_cache;
DROP TABLE IF EXISTS workspace_storage_configs;
DROP TABLE IF EXISTS encryption_keys CASCADE;

ALTER TABLE assets DROP COLUMN IF EXISTS encryption_key_id;
ALTER TABLE assets DROP COLUMN IF EXISTS is_encrypted;
ALTER TABLE assets DROP COLUMN IF EXISTS rating;
ALTER TABLE assets DROP COLUMN IF EXISTS color_label;
ALTER TABLE assets DROP COLUMN IF EXISTS lens_model;
ALTER TABLE assets DROP COLUMN IF EXISTS focal_length;
ALTER TABLE assets DROP COLUMN IF EXISTS iso_value;
ALTER TABLE assets DROP COLUMN IF EXISTS aperture;
ALTER TABLE assets DROP COLUMN IF EXISTS shutter_speed;

ALTER TABLE workspaces DROP COLUMN IF EXISTS plan_tier;
