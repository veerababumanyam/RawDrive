-- M8: Live Streaming & Desktop Companion
-- Creates: streams, stream_chats, video_assets, desktop_sessions

-- Live Streams (Cloudflare Stream integration)
CREATE TABLE IF NOT EXISTS streams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    gallery_id UUID REFERENCES galleries(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'scheduled', 'live', 'ended', 'processing_vod', 'vod_ready', 'failed')),
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    -- Cloudflare Stream fields
    cf_stream_uid TEXT,
    cf_rtmps_url TEXT,
    cf_rtmps_key TEXT,
    cf_playback_url TEXT,
    cf_vod_uid TEXT,
    -- Stream config
    pin_code TEXT,
    max_quality TEXT NOT NULL DEFAULT '1080p',
    chat_enabled BOOLEAN NOT NULL DEFAULT true,
    chat_slow_mode_seconds INTEGER NOT NULL DEFAULT 0,
    -- Metrics
    peak_viewers INTEGER NOT NULL DEFAULT 0,
    total_views INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_streams_workspace ON streams(workspace_id);
CREATE INDEX IF NOT EXISTS idx_streams_status ON streams(status) WHERE status IN ('live', 'scheduled');
CREATE INDEX IF NOT EXISTS idx_streams_gallery ON streams(gallery_id);
CREATE INDEX IF NOT EXISTS idx_streams_created_by ON streams(created_by);

-- Stream Chat Messages
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

-- Video Assets (extends asset pipeline for video support)
CREATE TABLE IF NOT EXISTS video_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
    duration_seconds INTEGER,
    codec TEXT,
    resolution TEXT,
    file_size_bytes BIGINT,
    -- Transcoding outputs
    qualities JSONB NOT NULL DEFAULT '[]',
    thumbnail_urls JSONB NOT NULL DEFAULT '[]',
    cf_video_uid TEXT,
    cf_playback_url TEXT,
    error_message TEXT,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_assets_asset ON video_assets(asset_id);
CREATE INDEX IF NOT EXISTS idx_video_assets_workspace ON video_assets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_video_assets_status ON video_assets(status) WHERE status IN ('pending', 'processing');

-- Desktop Sessions (companion app tracking)
CREATE TABLE IF NOT EXISTS desktop_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL,
    os TEXT NOT NULL CHECK (os IN ('windows', 'macos', 'linux')),
    app_version TEXT NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    upload_stats JSONB NOT NULL DEFAULT '{"total_uploaded": 0, "total_bytes": 0}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_desktop_sessions_user ON desktop_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_desktop_sessions_workspace ON desktop_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_desktop_sessions_active ON desktop_sessions(user_id, is_active) WHERE is_active = true;

-- Add video flag to assets table
ALTER TABLE assets ADD COLUMN IF NOT EXISTS is_video BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS video_duration_seconds INTEGER;
