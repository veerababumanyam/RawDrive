-- M22: Gallery share-by-email audit log
CREATE TABLE IF NOT EXISTS gallery_share_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    sent_to_email TEXT NOT NULL,
    sent_by_user_id UUID NOT NULL REFERENCES users(id),
    message TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_share_logs_gallery ON gallery_share_logs(gallery_id);
CREATE INDEX IF NOT EXISTS idx_gallery_share_logs_sent_at ON gallery_share_logs(gallery_id, sent_at);
