-- M41 / 104 down — restore the derivatives/ prefix for WebP thumbnail keys
--
-- Inverse of the up migration. Provided so rollbacks compose with the
-- worker code reverting to writing WebP thumbs under derivatives/. Note
-- that rolling back WITHOUT also reverting the worker leaves an
-- inconsistent state: the JSONB column would point at derivatives/ keys
-- while the worker writes thumbnails/ keys for new uploads. Tooling that
-- triggers this down should also pin the backend to a pre-104 commit.
UPDATE assets
SET thumbnail_urls = regexp_replace(
        thumbnail_urls::text,
        'thumbnails/([^/"]+)/thumb_(sm|md|lg)_webp\.webp',
        'derivatives/\1/thumb_\2_webp.webp',
        'g'
    )::jsonb
WHERE thumbnail_urls::text ~ 'thumbnails/[^/"]+/thumb_(sm|md|lg)_webp\.webp';
