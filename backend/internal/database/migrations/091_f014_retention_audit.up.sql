-- M35 / F-014: retention purge audit trail (E110-S1).
-- One row per purge batch so operators can prove each daily job ran
-- (count + cutoff window, even when zero rows deleted). RLS not required —
-- access is gated at the handler via RequirePlatformRole("super_admin").

CREATE TABLE IF NOT EXISTS streaming_retention_audit (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name        TEXT NOT NULL CHECK (job_name IN ('chat', 'viewer_sessions', 'replays')),
    ran_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cutoff_date     TIMESTAMPTZ NOT NULL,
    row_count       INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
    dry_run         BOOLEAN NOT NULL DEFAULT FALSE,
    details         JSONB
);

CREATE INDEX IF NOT EXISTS idx_streaming_retention_audit_job_ran
    ON streaming_retention_audit(job_name, ran_at DESC);
