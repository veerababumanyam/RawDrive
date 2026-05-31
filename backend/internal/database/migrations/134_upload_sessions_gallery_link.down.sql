-- Down for 134 — drop the upload-session destination columns. The link rows
-- they produced live in gallery_assets and are NOT removed here: the down only
-- reverses the schema addition, not the side effects of any uploads that ran
-- while the columns existed (mirrors the append-only, side-effect-preserving
-- convention used by the other 13x downs in this directory).

ALTER TABLE upload_sessions
    DROP COLUMN IF EXISTS gallery_id,
    DROP COLUMN IF EXISTS album_id;
