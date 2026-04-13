-- M31 / F-014 · Streams table extensions + calendar live_stream enum
--
-- Stories landed:
--   E102-S2 Streams table extensions (client/deal/calendar/access/live/replay metadata)
--   E102-S3 Calendar + client-profile linkage (events.event_type gains 'live_stream')
--
-- All new columns are nullable with safe defaults so existing M8 streams keep working.
-- Existing event rows keep their event_type; new enum value is additive.

-- ---------- E102-S2: streams extensions ----------

ALTER TABLE streams
    ADD COLUMN IF NOT EXISTS client_id                  UUID REFERENCES contacts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deal_id                    UUID REFERENCES deals(id)    ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS contact_id                 UUID REFERENCES contacts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS calendar_event_id          UUID REFERENCES events(id)   ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS invoice_id                 UUID,
    ADD COLUMN IF NOT EXISTS expected_duration_minutes  INTEGER,
    ADD COLUMN IF NOT EXISTS timezone                   TEXT,
    ADD COLUMN IF NOT EXISTS access_level               TEXT NOT NULL DEFAULT 'pin_protected',
    ADD COLUMN IF NOT EXISTS chat_policy                TEXT NOT NULL DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS live_state                 TEXT NOT NULL DEFAULT 'idle',
    ADD COLUMN IF NOT EXISTS replay_state               TEXT NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS replay_url                 TEXT,
    ADD COLUMN IF NOT EXISTS replay_expires_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS current_reservation_id     UUID;

-- Constraint-level validation (named so down.sql can drop cleanly).
ALTER TABLE streams
    DROP CONSTRAINT IF EXISTS streams_access_level_check;
ALTER TABLE streams
    ADD  CONSTRAINT streams_access_level_check
    CHECK (access_level IN ('public', 'pin_protected', 'workspace_only', 'invite_only'));

ALTER TABLE streams
    DROP CONSTRAINT IF EXISTS streams_chat_policy_check;
ALTER TABLE streams
    ADD  CONSTRAINT streams_chat_policy_check
    CHECK (chat_policy IN ('open', 'moderated', 'disabled', 'subscribers_only'));

ALTER TABLE streams
    DROP CONSTRAINT IF EXISTS streams_live_state_check;
ALTER TABLE streams
    ADD  CONSTRAINT streams_live_state_check
    CHECK (live_state IN ('idle', 'provisioning', 'ready', 'live', 'ending', 'ended', 'failed'));

ALTER TABLE streams
    DROP CONSTRAINT IF EXISTS streams_replay_state_check;
ALTER TABLE streams
    ADD  CONSTRAINT streams_replay_state_check
    CHECK (replay_state IN ('none', 'processing', 'available', 'expired', 'deleted'));

CREATE INDEX IF NOT EXISTS idx_streams_client_id           ON streams(client_id)           WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_streams_deal_id             ON streams(deal_id)             WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_streams_calendar_event      ON streams(calendar_event_id)   WHERE calendar_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_streams_replay_expires      ON streams(replay_expires_at)
    WHERE replay_state = 'available' AND replay_expires_at IS NOT NULL;

COMMENT ON COLUMN streams.access_level          IS 'public | pin_protected | workspace_only | invite_only';
COMMENT ON COLUMN streams.chat_policy           IS 'open | moderated | disabled | subscribers_only';
COMMENT ON COLUMN streams.live_state            IS 'idle -> provisioning -> ready -> live -> ending -> ended (failed branches). Independent of M8 status.';
COMMENT ON COLUMN streams.replay_state          IS 'none -> processing -> available -> expired -> deleted';
COMMENT ON COLUMN streams.replay_expires_at     IS 'Computed at stream end per F-014 D3 (basic=7d/pro=30d/ent=90d)';
COMMENT ON COLUMN streams.current_reservation_id IS 'FK-by-id to streaming_reservations (table lands in 086). Kept soft (no FK constraint) to avoid ordering headaches.';

-- ---------- E102-S3: events.event_type gains 'live_stream' ----------

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_type_check;
ALTER TABLE events
    ADD CONSTRAINT events_type_check
    CHECK (event_type IN ('shoot', 'meeting', 'editing', 'personal', 'travel', 'blocked', 'other', 'live_stream'));

-- Optional soft link: event rows representing a live stream can carry stream_id.
-- Added as nullable column (no FK here to avoid cross-module coupling — validated
-- at application layer in handler/client_profile_handler.go).
ALTER TABLE events
    ADD COLUMN IF NOT EXISTS stream_id UUID;

CREATE INDEX IF NOT EXISTS idx_events_stream_id ON events(stream_id) WHERE stream_id IS NOT NULL;

COMMENT ON COLUMN events.stream_id IS 'Soft link to streams(id) when event_type = live_stream. No hard FK — validated in handler.';
