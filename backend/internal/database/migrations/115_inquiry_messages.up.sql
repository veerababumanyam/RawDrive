-- Migration 110: per-inquiry conversation thread
-- Replaces the single reply_message field with a proper messages table so
-- both parties can exchange multiple messages within the same inquiry.
CREATE TABLE IF NOT EXISTS inquiry_messages (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_id  UUID        NOT NULL REFERENCES marketplace_inquiries(id) ON DELETE CASCADE,
    sender_id   UUID        NOT NULL REFERENCES users(id),
    body        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiry_messages_inquiry_id
    ON inquiry_messages (inquiry_id, created_at);
