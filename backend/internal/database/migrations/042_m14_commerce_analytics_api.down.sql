-- Rollback M14: Gallery Commerce, Analytics & APIs

ALTER TABLE galleries DROP COLUMN IF EXISTS watermark_enabled;
ALTER TABLE galleries DROP COLUMN IF EXISTS download_quality;
ALTER TABLE galleries DROP COLUMN IF EXISTS allow_downloads;

DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS webhooks;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS gallery_analytics_daily;
DROP TABLE IF EXISTS gallery_analytics_events;
DROP TABLE IF EXISTS gallery_orders;
DROP TABLE IF EXISTS gallery_carts;
DROP TABLE IF EXISTS gallery_products;
DROP TABLE IF EXISTS download_events;
DROP TABLE IF EXISTS download_jobs;
