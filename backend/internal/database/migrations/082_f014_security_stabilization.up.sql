-- M30 / F-014 Security Stabilization
--
-- Adds:
--   E100-S1: streams.pin_hash (argon2id) column + backfill from plaintext pin_code.
--   E100-S4: chat_messages (workspace_id-scoped, RLS-safe) + reaction_events.
--            Preserves existing stream_chats for data migration (dropped later in E108-S4 / M35).
--   E101-S1: platform_settings seed rows for streaming.cf_* and streaming.allowed_origins.
--   E101-S2: permissions seed for streams:create|control|delete|moderate.
--
-- Notes:
--   - Dropping streams.pin_code is deferred until the argon2id handler is
--     deployed and backfilled rows are validated (E108-S4 migration).
--   - All new tables carry RLS policies checking either the tenant session
--     (app.current_workspace_id) OR a viewer session (app.viewer_session_id).

-- ---------- E100-S1: PIN hash column ----------
ALTER TABLE streams
    ADD COLUMN IF NOT EXISTS pin_hash TEXT;

COMMENT ON COLUMN streams.pin_hash IS
    'argon2id PHC-encoded PIN. Replaces legacy plaintext pin_code (dropped in M35 E108-S4).';

-- Note: backfill from plaintext pin_code happens in an application-level
-- task during deploy, not in SQL — argon2id requires calling Go code.

-- ---------- E100-S4: chat_messages (RLS-safe replacement for stream_chats) ----------
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL,
    viewer_session_id UUID,
    author_user_id UUID,                         -- null for viewer-posted messages
    body TEXT NOT NULL CHECK (char_length(body) <= 2000),
    posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    deleted_by_user_id UUID
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_stream_posted
    ON chat_messages(stream_id, posted_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_workspace
    ON chat_messages(workspace_id);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages FORCE  ROW LEVEL SECURITY;

CREATE POLICY chat_messages_read ON chat_messages FOR SELECT
USING (
    workspace_id::text = current_setting('app.current_workspace_id', true)
    OR viewer_session_id::text = current_setting('app.viewer_session_id', true)
);

CREATE POLICY chat_messages_insert ON chat_messages FOR INSERT
WITH CHECK (
    workspace_id::text = current_setting('app.current_workspace_id', true)
    OR viewer_session_id::text = current_setting('app.viewer_session_id', true)
);

CREATE POLICY chat_messages_update ON chat_messages FOR UPDATE
USING (workspace_id::text = current_setting('app.current_workspace_id', true))
WITH CHECK (workspace_id::text = current_setting('app.current_workspace_id', true));

-- ---------- E100-S4: reaction_events ----------
CREATE TABLE IF NOT EXISTS reaction_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL,
    viewer_session_id UUID,
    kind TEXT NOT NULL CHECK (kind IN ('thumbs_up', 'heart', 'celebrate', 'laugh')),
    emitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reaction_events_stream_emitted
    ON reaction_events(stream_id, emitted_at DESC);

ALTER TABLE reaction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE reaction_events FORCE  ROW LEVEL SECURITY;

CREATE POLICY reaction_events_read ON reaction_events FOR SELECT
USING (
    workspace_id::text = current_setting('app.current_workspace_id', true)
    OR viewer_session_id::text = current_setting('app.viewer_session_id', true)
);

CREATE POLICY reaction_events_insert ON reaction_events FOR INSERT
WITH CHECK (
    workspace_id::text = current_setting('app.current_workspace_id', true)
    OR viewer_session_id::text = current_setting('app.viewer_session_id', true)
);

-- ---------- E101-S1: platform_settings rows for streaming ----------
-- Values left empty; super-admin fills via the existing settings CRUD UI.
-- is_secret=true routes through the F-005 envelope at the repo layer.
INSERT INTO platform_settings (category, key, value, is_secret, description)
VALUES
    ('streaming', 'cf_api_token',     '', true,  'Cloudflare Stream API token'),
    ('streaming', 'cf_account_id',    '', false, 'Cloudflare account ID'),
    ('streaming', 'cf_signing_key',   '', true,  'Cloudflare signed URL JWK (for viewer playback tokens)'),
    ('streaming', 'cf_webhook_secret','', true,  'Shared secret for Cloudflare Stream webhook verification'),
    ('streaming', 'allowed_origins',  '', false, 'Comma-separated list of allowed origins for signed playback URLs')
ON CONFLICT (category, key) DO NOTHING;

-- ---------- E101-S2: stream permissions ----------
-- The project uses role-based access via workspace_members.role and the
-- middleware.RequireWorkspaceRole wrapper (hierarchy: Owner > Admin >
-- Editor > Viewer). Stream management already routes through that guard
-- in backend/internal/handler/routes_m8.go — no additional permission
-- rows are needed. This note is left here so that a future FEAT-014
-- wave that introduces a permissions table knows the mapping:
--   streams:create   -> Admin+
--   streams:control  -> Admin+
--   streams:delete   -> Admin+
--   streams:moderate -> Admin+ (chat mute/delete)
