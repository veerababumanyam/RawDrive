-- M31 / F-014 · Streaming reservations (state machine)
--
-- Story: E102-S1 + E102-S4
--
-- A reservation locks N minutes of credit before a stream provisions. Lifecycle:
--   pending    : created, credits held
--   active     : stream went live, still consuming against the reservation
--   consumed   : stream ended within budget, consume entry posted
--   overrun    : stream ended over budget, consume + overage posted
--   refunded   : stream cancelled before going live, reservation released
--   expired    : pending reservation timed out without going live (auto-refund)

CREATE TABLE IF NOT EXISTS streaming_reservations (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id              UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    stream_id                 UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    package_id                UUID NOT NULL REFERENCES streaming_packages(id),
    rate_card_id              UUID NOT NULL REFERENCES streaming_rate_cards(id),
    reserved_minutes          INTEGER NOT NULL CHECK (reserved_minutes > 0),
    reserved_amount_paise     BIGINT  NOT NULL CHECK (reserved_amount_paise >= 0),
    consumed_minutes          INTEGER NOT NULL DEFAULT 0 CHECK (consumed_minutes >= 0),
    overage_minutes           INTEGER NOT NULL DEFAULT 0 CHECK (overage_minutes >= 0),
    state                     TEXT NOT NULL DEFAULT 'pending',
    idempotency_key           TEXT NOT NULL,
    expires_at                TIMESTAMPTZ,   -- pending reservations auto-expire after this
    created_by                UUID REFERENCES users(id),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT streaming_reservations_state_check
        CHECK (state IN ('pending', 'active', 'consumed', 'overrun', 'refunded', 'expired')),
    CONSTRAINT streaming_reservations_idempotency_unique
        UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_streaming_reservations_workspace
    ON streaming_reservations(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_streaming_reservations_stream
    ON streaming_reservations(stream_id);
CREATE INDEX IF NOT EXISTS idx_streaming_reservations_pending_expires
    ON streaming_reservations(expires_at)
    WHERE state = 'pending' AND expires_at IS NOT NULL;

ALTER TABLE streaming_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaming_reservations FORCE  ROW LEVEL SECURITY;

CREATE POLICY streaming_reservations_read ON streaming_reservations FOR SELECT
USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY streaming_reservations_write ON streaming_reservations FOR ALL
USING (workspace_id::text = current_setting('app.current_workspace_id', true))
WITH CHECK (workspace_id::text = current_setting('app.current_workspace_id', true));

COMMENT ON TABLE streaming_reservations IS 'Credit reservations per stream. Drives the ledger reserve/consume/refund/overage flow (F-014 D2).';
