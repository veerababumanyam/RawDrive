-- M5: Internal Messaging tables
-- Migration 000016: channels, channel_members, messages

-- Channels
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    channel_type VARCHAR(20) NOT NULL DEFAULT 'general'
        CHECK (channel_type IN ('general', 'event', 'client', 'dm')),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_workspace ON channels(workspace_id);
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(workspace_id, channel_type);

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channels_workspace_isolation ON channels;
CREATE POLICY channels_workspace_isolation ON channels
    FOR ALL USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

-- Channel Members
CREATE TABLE IF NOT EXISTS channel_members (
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    last_read_at TIMESTAMPTZ,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);

ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_members_workspace_isolation ON channel_members;
CREATE POLICY channel_members_workspace_isolation ON channel_members
    FOR ALL USING (
        channel_id IN (
            SELECT id FROM channels
            WHERE workspace_id = current_setting('app.current_workspace_id', true)::uuid
        )
    );

-- Messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_type VARCHAR(20) NOT NULL DEFAULT 'text'
        CHECK (message_type IN ('text', 'image', 'file', 'system')),
    body TEXT NOT NULL,
    attachment_url TEXT,
    parent_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add full-text search vector (generated column)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, inserted_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_workspace ON messages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_message_id) WHERE parent_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_search ON messages USING GIN(search_vector);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_workspace_isolation ON messages;
CREATE POLICY messages_workspace_isolation ON messages
    FOR ALL USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

-- Client Conversations (for E17-S2: client portal)
CREATE TABLE IF NOT EXISTS client_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    client_name VARCHAR(255),
    client_email VARCHAR(255),
    share_token VARCHAR(255) NOT NULL,
    is_client_exempt_retention BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(gallery_id, share_token)
);

CREATE INDEX IF NOT EXISTS idx_client_conversations_gallery ON client_conversations(gallery_id);
CREATE INDEX IF NOT EXISTS idx_client_conversations_workspace ON client_conversations(workspace_id);

ALTER TABLE client_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_conversations_workspace_isolation ON client_conversations;
CREATE POLICY client_conversations_workspace_isolation ON client_conversations
    FOR ALL USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid);
