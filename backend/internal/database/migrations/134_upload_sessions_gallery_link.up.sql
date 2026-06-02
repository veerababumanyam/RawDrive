-- 134 — S3-G4 / AREA-UPLOADER-3 (audit 2026-05-31): carry the destination
-- gallery (and optional album) on the upload session so finalize can link the
-- finalized asset server-side, atomically, in the same flow as the asset
-- insert.
--
-- Before this migration upload_sessions had no notion of *where* the upload
-- was destined. The asset was created at finalize, but the gallery_assets link
-- was only ever made by a best-effort CLIENT call (addAssetToGallery in
-- frontend/.../galleries/[id]/page.tsx) AFTER finalize returned. If the tab
-- closed or the network dropped between finalize and that call, the asset
-- became dark storage: counted against quota, charged a credit, but invisible
-- and unmanageable in the gallery UI. Persisting the target on the session row
-- lets the server perform the link itself, so association never depends on the
-- client surviving the round-trip.
--
-- Both columns are NULLABLE and have no NOT NULL/CHECK constraint: a session
-- created without a target behaves exactly as before (no server-side link),
-- preserving backward compatibility with the legacy client-link flow. The FKs
-- use ON DELETE SET NULL rather than CASCADE: deleting a gallery/album mid-
-- upload should orphan the (still-in-flight) session's target, not delete the
-- session row and leak its R2 multipart state past the cleanup sweeper.

ALTER TABLE upload_sessions
    ADD COLUMN IF NOT EXISTS gallery_id uuid REFERENCES galleries(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS album_id   uuid REFERENCES albums(id)    ON DELETE SET NULL;
