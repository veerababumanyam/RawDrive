-- M34 / F-014: streaming shortlinks + hit tracking (E109-C1)
-- Short 8-char base62 codes (alphabet excludes 0/O/I/l/1) resolving to a stream_id.
-- Hits table records anonymised (sha256 ip_hash) analytics with ?src=qr|wa|email|invite|direct.

CREATE TABLE IF NOT EXISTS streaming_shortlinks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    shortcode       VARCHAR(16) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_streaming_shortlinks_stream ON streaming_shortlinks(stream_id);

CREATE TABLE IF NOT EXISTS streaming_shortlink_hits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shortcode       VARCHAR(16) NOT NULL,
    src             VARCHAR(16) NOT NULL CHECK (src IN ('qr','wa','email','invite','direct')),
    ip_hash         CHAR(64) NOT NULL,
    user_agent      TEXT,
    at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_streaming_shortlink_hits_shortcode_at
    ON streaming_shortlink_hits(shortcode, at DESC);
