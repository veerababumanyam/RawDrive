-- Recreate stream_chats schema mirroring migration 045_m8_streaming_desktop.
-- Schema only — chat data is NOT restored (archived rows remain in chat_messages).

CREATE TABLE IF NOT EXISTS stream_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    user_id UUID REFERENCES users(id),
    message TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'chat' CHECK (message_type IN ('chat', 'reaction', 'system', 'moderation')),
    is_muted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stream_chats_stream ON stream_chats(stream_id);
CREATE INDEX IF NOT EXISTS idx_stream_chats_created ON stream_chats(stream_id, created_at);
