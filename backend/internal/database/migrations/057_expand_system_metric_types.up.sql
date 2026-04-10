-- Widen the system_metrics.metric_type CHECK constraint to include the
-- percentile-distinct latency values (latency_p50/p95/p99) required by
-- the admin System Health summary endpoint. Also keeps the existing
-- flat values for backward compatibility.
--
-- Migration: 057_expand_system_metric_types
--
-- Context: Migration 033 created system_metrics with a CHECK restricted
-- to ('latency', 'error_rate', 'queue_depth', 'cpu', 'memory', 'disk',
-- 'connections'). The admin UI needs to render p50/p95/p99 latencies
-- distinctly, and the service layer now reads metric_type values
-- 'latency_p50', 'latency_p95', 'latency_p99'. Without widening the
-- constraint, any collector attempting to write those rows would be
-- rejected at INSERT time.

BEGIN;

ALTER TABLE system_metrics
    DROP CONSTRAINT IF EXISTS system_metrics_metric_type_check;

ALTER TABLE system_metrics
    ADD CONSTRAINT system_metrics_metric_type_check
    CHECK (metric_type IN (
        'latency',
        'latency_p50',
        'latency_p95',
        'latency_p99',
        'error_rate',
        'queue_depth',
        'cpu',
        'memory',
        'disk',
        'connections'
    ));

COMMIT;
