-- M41 / 104 — move WebP thumbnail keys from derivatives/ to thumbnails/
--
-- Companion to the worker change that writes WebP thumb variants under the
-- public `thumbnails/<id>/<name>.webp` prefix so the storage proxy can
-- bypass per-tile JWT validation on dashboard gallery loads. Without this
-- migration, existing rows still carry the old `derivatives/...thumb_*_webp.webp`
-- keys and the frontend's WebP-preferring picker keeps hitting the auth path.
--
-- Scope of the rewrite — exactly three keys per asset:
--    derivatives/<id>/thumb_sm_webp.webp  →  thumbnails/<id>/thumb_sm_webp.webp
--    derivatives/<id>/thumb_md_webp.webp  →  thumbnails/<id>/thumb_md_webp.webp
--    derivatives/<id>/thumb_lg_webp.webp  →  thumbnails/<id>/thumb_lg_webp.webp
--
-- Intentionally NOT rewritten: `display_webp` (full-res 2400px) stays under
-- derivatives/ — it is served via the authenticated edge-delivery path on
-- purpose, and the storage proxy's public guard only matches the
-- `thumbnails/` prefix.
--
-- Predicate is narrow (literal `derivatives/...thumb_*_webp.webp`) so the
-- regex cannot accidentally clobber `display_webp` or future non-thumbnail
-- WebP variants stored under derivatives/. The R2 objects themselves are
-- NOT moved here — the worker re-processes assets and writes to the new
-- location. Operators run `UPDATE assets SET status='processing' WHERE …`
-- to drain stale derivative bytes after the migration applies; rows whose
-- thumbs haven't been regenerated yet will 404 on the new path until they
-- are reprocessed, which is the same failure mode as any worker outage
-- (the gallery skeleton tile remains in place until the worker completes).
UPDATE assets
SET thumbnail_urls = regexp_replace(
        thumbnail_urls::text,
        'derivatives/([^/"]+)/thumb_(sm|md|lg)_webp\.webp',
        'thumbnails/\1/thumb_\2_webp.webp',
        'g'
    )::jsonb
WHERE thumbnail_urls::text ~ 'derivatives/[^/"]+/thumb_(sm|md|lg)_webp\.webp';
