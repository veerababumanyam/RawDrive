-- Rollback: 057_expand_system_metric_types
--
-- Restores the original system_metrics.metric_type CHECK constraint from
-- migration 033. Any rows written with the widened values (latency_p50,
-- latency_p95, latency_p99) MUST be cleared or migrated before running
-- this down — otherwise the ALTER will fail because existing rows will
-- violate the narrowed constraint.

BEGIN;

DELETE FROM system_metrics
WHERE metric_type IN ('latency_p50', 'latency_p95', 'latency_p99');

ALTER TABLE system_metrics
    DROP CONSTRAINT IF EXISTS system_metrics_metric_type_check;

ALTER TABLE system_metrics
    ADD CONSTRAINT system_metrics_metric_type_check
    CHECK (metric_type IN (
        'latency',
        'error_rate',
        'queue_depth',
        'cpu',
        'memory',
        'disk',
        'connections'
    ));

COMMIT;
