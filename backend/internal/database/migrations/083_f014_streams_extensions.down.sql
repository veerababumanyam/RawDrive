-- M31 / F-014 · Rollback streams extensions + calendar live_stream enum

-- Events
DROP INDEX IF EXISTS idx_events_stream_id;
ALTER TABLE events DROP COLUMN IF EXISTS stream_id;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_type_check;
ALTER TABLE events
    ADD CONSTRAINT events_type_check
    CHECK (event_type IN ('shoot', 'meeting', 'editing', 'personal', 'travel', 'blocked', 'other'));

-- Streams
DROP INDEX IF EXISTS idx_streams_replay_expires;
DROP INDEX IF EXISTS idx_streams_calendar_event;
DROP INDEX IF EXISTS idx_streams_deal_id;
DROP INDEX IF EXISTS idx_streams_client_id;

ALTER TABLE streams DROP CONSTRAINT IF EXISTS streams_replay_state_check;
ALTER TABLE streams DROP CONSTRAINT IF EXISTS streams_live_state_check;
ALTER TABLE streams DROP CONSTRAINT IF EXISTS streams_chat_policy_check;
ALTER TABLE streams DROP CONSTRAINT IF EXISTS streams_access_level_check;

ALTER TABLE streams
    DROP COLUMN IF EXISTS current_reservation_id,
    DROP COLUMN IF EXISTS replay_expires_at,
    DROP COLUMN IF EXISTS replay_url,
    DROP COLUMN IF EXISTS replay_state,
    DROP COLUMN IF EXISTS live_state,
    DROP COLUMN IF EXISTS chat_policy,
    DROP COLUMN IF EXISTS access_level,
    DROP COLUMN IF EXISTS timezone,
    DROP COLUMN IF EXISTS expected_duration_minutes,
    DROP COLUMN IF EXISTS invoice_id,
    DROP COLUMN IF EXISTS calendar_event_id,
    DROP COLUMN IF EXISTS contact_id,
    DROP COLUMN IF EXISTS deal_id,
    DROP COLUMN IF EXISTS client_id;
