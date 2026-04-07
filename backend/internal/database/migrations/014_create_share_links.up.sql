CREATE TABLE IF NOT EXISTS share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    pin_hash TEXT,
    expires_at TIMESTAMPTZ,
    permissions JSONB DEFAULT '{}',
    download_allowed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    CONSTRAINT share_links_token_unique UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_share_links_gallery_id ON share_links(gallery_id);
CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token) WHERE revoked_at IS NULL;
