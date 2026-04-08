-- M3: AI configuration (BYOK keys), usage logging, and async job tracking

CREATE TABLE IF NOT EXISTS ai_configs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider         VARCHAR(50) NOT NULL DEFAULT 'gemini',
    encrypted_key    TEXT NOT NULL,
    model_preference VARCHAR(100) NOT NULL DEFAULT 'gemini-2.0-flash',
    monthly_cap_paisa BIGINT NOT NULL DEFAULT 0,
    alert_80_sent    BOOLEAN NOT NULL DEFAULT FALSE,
    alert_100_sent   BOOLEAN NOT NULL DEFAULT FALSE,
    enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(workspace_id, provider)
);

ALTER TABLE ai_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_configs_workspace_isolation ON ai_configs;
CREATE POLICY ai_configs_workspace_isolation ON ai_configs
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.current_workspace_id', true)
    );

CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    operation           VARCHAR(50) NOT NULL,
    model               VARCHAR(100) NOT NULL,
    input_tokens        BIGINT NOT NULL DEFAULT 0,
    output_tokens       BIGINT NOT NULL DEFAULT 0,
    cost_estimate_paisa BIGINT NOT NULL DEFAULT 0,
    asset_id            UUID,
    job_id              UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_workspace_created ON ai_usage_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_workspace_operation ON ai_usage_logs(workspace_id, operation);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_workspace_isolation ON ai_usage_logs;
CREATE POLICY ai_usage_workspace_isolation ON ai_usage_logs
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.current_workspace_id', true)
    );

CREATE TABLE IF NOT EXISTS ai_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    total_items     INTEGER NOT NULL DEFAULT 0,
    processed_items INTEGER NOT NULL DEFAULT 0,
    result          JSONB,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_pending ON ai_jobs(type, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ai_jobs_workspace ON ai_jobs(workspace_id, created_at DESC);

ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_jobs_workspace_isolation ON ai_jobs;
CREATE POLICY ai_jobs_workspace_isolation ON ai_jobs
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.current_workspace_id', true)
    );
