-- M41 / 103 — strip production host prefix from assets.thumbnail_urls
--
-- Backfill follow-up to the thumbnail-worker fix. The worker used to default
-- PUBLIC_API_URL to "https://api.rawdrive.in" and persisted absolute URLs
-- like "https://api.rawdrive.in/storage/thumbnails/<id>/thumb_md.jpg" into
-- the assets.thumbnail_urls JSONB column. Frontend `getStorageBackedUrl()`
-- short-circuits absolute URLs and returns them as-is, so every <img src>
-- on any non-production host rendered as a broken cracked-image icon.
--
-- The worker fix (worker/thumbnail_worker.go) now persists bare keys like
-- "thumbnails/<id>/thumb_md.jpg" so the frontend can resolve to the running
-- host at render time. This migration rewrites the legacy rows so the fix
-- also unblocks images that were already uploaded.
--
-- Predicate is intentionally narrow (literal "api.rawdrive.in/storage/")
-- rather than any "https://*/storage/" — the broader form could clobber
-- legitimate CDN or presigned URLs that some workspaces store here. If
-- additional poisoned host prefixes are discovered later, append a new
-- numbered migration rather than widening this one.
UPDATE assets
SET thumbnail_urls = regexp_replace(
        thumbnail_urls::text,
        'https://api\.rawdrive\.in/storage/',
        '',
        'g'
    )::jsonb
WHERE thumbnail_urls::text LIKE '%api.rawdrive.in/storage/%';
