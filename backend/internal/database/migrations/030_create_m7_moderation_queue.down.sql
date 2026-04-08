-- Rollback: 030_create_m7_moderation_queue

BEGIN;

DROP TABLE IF EXISTS moderation_items CASCADE;

COMMIT;
