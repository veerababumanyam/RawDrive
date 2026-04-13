-- M31 / F-014 · Live events, delivery log, viewer sessions, ingest reveal audit
--
-- Story: E102-S1
--
-- These four tables round out the F-014 persistence layer:
--   * live_events              — top-level event record (wedding / concert / reveal)
--   * live_event_delivery      — per-delivery instance (one event can stream multiple sessions)
--   * viewer_sessions          — persisted viewer-JWT state (created by M30 middleware;
--                                 schema lands here for FK integrity and replay counting)
--   * ingest_reveal_audit      — audit trail for T-30 ingest-key reveal (M33 ships logic)

-- ---------- live_events ----------

CREATE TABLE IF NOT EXISTS live_events (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    client_id             UUID REFERENCES contacts(id) ON DELETE SET NULL,
    deal_id               UUID REFERENCES deals(id)    ON DELETE SET NULL,
    calendar_event_id     UUID REFERENCES events(id)   ON DELETE SET NULL,
    title                 TEXT NOT NULL,
    description           TEXT,
    event_type            TEXT NOT NULL DEFAULT 'general',
    scheduled_start_at    TIMESTAMPTZ NOT NULL,
    scheduled_end_at      TIMESTAMPTZ NOT NULL,
    timezone              TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    status                TEXT NOT NULL DEFAULT 'scheduled',
    created_by            UUID REFERENCES users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT live_events_status_check
        CHECK (status IN ('draft', 'scheduled', 'live', 'ended', 'cancelled')),
    CONSTRAINT live_events_time_check
        CHECK (scheduled_end_at > scheduled_start_at)
);

CREATE INDEX IF NOT EXISTS idx_live_events_workspace_scheduled
    ON live_events(workspace_id, scheduled_start_at);

ALTER TABLE live_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_events FORCE  ROW LEVEL SECURITY;

CREATE POLICY live_events_all ON live_events FOR ALL
USING (workspace_id::text = current_setting('app.current_workspace_id', true))
WITH CHECK (workspace_id::text = current_setting('app.current_workspace_id', true));

-- ---------- live_event_delivery ----------

CREATE TABLE IF NOT EXISTS live_event_delivery (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_event_id         UUID NOT NULL REFERENCES live_events(id) ON DELETE CASCADE,
    stream_id             UUID REFERENCES streams(id) ON DELETE SET NULL,
    workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    sequence              INTEGER NOT NULL DEFAULT 1,
    started_at            TIMESTAMPTZ,
    ended_at              TIMESTAMPTZ,
    peak_concurrent       INTEGER NOT NULL DEFAULT 0,
    total_unique_viewers  INTEGER NOT NULL DEFAULT 0,
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT live_event_delivery_sequence_unique
        UNIQUE (live_event_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_live_event_delivery_event
    ON live_event_delivery(live_event_id);
CREATE INDEX IF NOT EXISTS idx_live_event_delivery_stream
    ON live_event_delivery(stream_id)
    WHERE stream_id IS NOT NULL;

ALTER TABLE live_event_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_event_delivery FORCE  ROW LEVEL SECURITY;

CREATE POLICY live_event_delivery_all ON live_event_delivery FOR ALL
USING (workspace_id::text = current_setting('app.current_workspace_id', true))
WITH CHECK (workspace_id::text = current_setting('app.current_workspace_id', true));

-- ---------- viewer_sessions ----------
-- M30 issues viewer JWTs in memory; this table persists them so reconnects and
-- anti-abuse checks have durable state. Populated lazily by the viewer middleware.

CREATE TABLE IF NOT EXISTS viewer_sessions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id             UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    workspace_id          UUID NOT NULL,
    viewer_key            TEXT NOT NULL,  -- hashed (IP + UA + optional identifier)
    issued_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at            TIMESTAMPTZ NOT NULL,
    revoked_at            TIMESTAMPTZ,
    CONSTRAINT viewer_sessions_unique_key
        UNIQUE (stream_id, viewer_key)
);

CREATE INDEX IF NOT EXISTS idx_viewer_sessions_expires
    ON viewer_sessions(expires_at)
    WHERE revoked_at IS NULL;

ALTER TABLE viewer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE viewer_sessions FORCE  ROW LEVEL SECURITY;

-- Read: either the owning workspace, or the viewer whose session id matches.
CREATE POLICY viewer_sessions_read ON viewer_sessions FOR SELECT
USING (
    workspace_id::text = current_setting('app.current_workspace_id', true)
    OR id::text         = current_setting('app.viewer_session_id', true)
);

-- Writes go through the viewer middleware on an elevated connection.
CREATE POLICY viewer_sessions_write ON viewer_sessions FOR ALL
USING (workspace_id::text = current_setting('app.current_workspace_id', true))
WITH CHECK (workspace_id::text = current_setting('app.current_workspace_id', true));

-- ---------- ingest_reveal_audit ----------

CREATE TABLE IF NOT EXISTS ingest_reveal_audit (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    stream_id             UUID NOT NULL REFERENCES streams(id)    ON DELETE CASCADE,
    revealed_by           UUID REFERENCES users(id),
    reveal_reason         TEXT,   -- 'scheduled_t_minus_30' | 'manual_override' | 'api'
    revealed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    client_ip             INET,
    user_agent            TEXT,
    CONSTRAINT ingest_reveal_audit_reason_check
        CHECK (reveal_reason IN ('scheduled_t_minus_30', 'manual_override', 'api', 'rotation'))
);

CREATE INDEX IF NOT EXISTS idx_ingest_reveal_audit_stream
    ON ingest_reveal_audit(stream_id, revealed_at DESC);

ALTER TABLE ingest_reveal_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest_reveal_audit FORCE  ROW LEVEL SECURITY;

CREATE POLICY ingest_reveal_audit_read ON ingest_reveal_audit FOR SELECT
USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY ingest_reveal_audit_insert ON ingest_reveal_audit FOR INSERT
WITH CHECK (workspace_id::text = current_setting('app.current_workspace_id', true));

-- Append-only: block UPDATE/DELETE.
CREATE OR REPLACE FUNCTION ingest_reveal_audit_immutable_guard()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'ingest_reveal_audit is append-only: % not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ingest_reveal_audit_no_update ON ingest_reveal_audit;
CREATE TRIGGER ingest_reveal_audit_no_update
    BEFORE UPDATE OR DELETE ON ingest_reveal_audit
    FOR EACH ROW EXECUTE FUNCTION ingest_reveal_audit_immutable_guard();
