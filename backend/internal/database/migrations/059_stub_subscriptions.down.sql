-- Rollback: 059_stub_subscriptions

BEGIN;

DROP TABLE IF EXISTS subscriptions CASCADE;

COMMIT;
