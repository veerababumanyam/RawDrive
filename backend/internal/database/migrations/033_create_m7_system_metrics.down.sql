-- Rollback: 033_create_m7_system_metrics

BEGIN;

DROP TABLE IF EXISTS alert_thresholds CASCADE;
DROP TABLE IF EXISTS system_metrics CASCADE;

COMMIT;
