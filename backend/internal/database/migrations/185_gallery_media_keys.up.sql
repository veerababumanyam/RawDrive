CREATE TABLE IF NOT EXISTS gallery_media_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    key_id TEXT NOT NULL,
    exported_key TEXT NOT NULL DEFAULT '',
    encrypted_key BYTEA,
    dek_wrapped BYTEA,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT gallery_media_keys_unique_key UNIQUE (gallery_id, key_id),
    CONSTRAINT gallery_media_keys_key_id_not_blank CHECK (btrim(key_id) <> ''),
    CONSTRAINT gallery_media_keys_secret_present CHECK (
        btrim(exported_key) <> '' OR
        (encrypted_key IS NOT NULL AND octet_length(encrypted_key) > 0 AND dek_wrapped IS NOT NULL AND octet_length(dek_wrapped) > 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_gallery_media_keys_gallery_id
    ON gallery_media_keys(gallery_id);

