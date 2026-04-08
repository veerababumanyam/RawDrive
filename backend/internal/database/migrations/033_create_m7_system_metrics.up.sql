-- M7 Admin Command Center: System metrics (partitioned) and alert thresholds
-- Migration: 033_create_m7_system_metrics

BEGIN;

DROP TABLE IF EXISTS system_metrics CASCADE;
CREATE TABLE system_metrics (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    service_name VARCHAR(50) NOT NULL,
    metric_type VARCHAR(30) NOT NULL CHECK (metric_type IN ('latency', 'error_rate', 'queue_depth', 'cpu', 'memory', 'disk', 'connections')),
    value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'ms',
    endpoint VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

CREATE TABLE IF NOT EXISTS system_metrics_current PARTITION OF system_metrics
    FOR VALUES FROM (date_trunc('month', NOW())) TO (date_trunc('month', NOW() + INTERVAL '1 month'));

CREATE TABLE IF NOT EXISTS system_metrics_next PARTITION OF system_metrics
    FOR VALUES FROM (date_trunc('month', NOW() + INTERVAL '1 month')) TO (date_trunc('month', NOW() + INTERVAL '2 months'));

CREATE INDEX IF NOT EXISTS idx_system_metrics_service ON system_metrics (service_name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_metrics_type ON system_metrics (metric_type, recorded_at DESC);

CREATE TABLE IF NOT EXISTS alert_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_type VARCHAR(30) NOT NULL,
    service_name VARCHAR(50),
    warning_threshold DOUBLE PRECISION NOT NULL,
    critical_threshold DOUBLE PRECISION NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
