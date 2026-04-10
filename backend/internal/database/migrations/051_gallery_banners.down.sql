-- M14 GAL-FR-157: rollback of gallery_banners table.
DROP INDEX IF EXISTS idx_gallery_banners_schedule;
DROP INDEX IF EXISTS idx_gallery_banners_gallery_active;
DROP TABLE IF EXISTS gallery_banners;
