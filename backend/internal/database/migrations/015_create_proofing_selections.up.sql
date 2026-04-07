CREATE TABLE IF NOT EXISTS proofing_selections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'selected',
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT proofing_selections_gallery_asset_email_unique UNIQUE (gallery_id, asset_id, client_email)
);

CREATE INDEX IF NOT EXISTS idx_proofing_selections_gallery_id ON proofing_selections(gallery_id);
CREATE INDEX IF NOT EXISTS idx_proofing_selections_client_email ON proofing_selections(gallery_id, client_email);
