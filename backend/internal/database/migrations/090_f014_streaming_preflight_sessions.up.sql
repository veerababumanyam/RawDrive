-- M34 / F-014: ephemeral preflight sessions (E109-C2)
-- CRITICAL INVARIANT: preflight sessions MUST NOT write credit-ledger rows.
-- Short-lived (TTL 60s) Cloudflare live inputs used only for desktop preflight /
-- test-broadcast. A reaper deletes the CF input at expires_at and marks
-- deleted=true; no credits are consumed.

CREATE TABLE IF NOT EXISTS streaming_preflight_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    cf_input_id     TEXT NOT NULL,
    rtmps_url       TEXT NOT NULL,
    rtmps_key_enc   BYTEA NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    deleted         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_preflight_sessions_reaper
    ON streaming_preflight_sessions(expires_at) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_preflight_sessions_stream
    ON streaming_preflight_sessions(stream_id);
