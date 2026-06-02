ALTER TABLE galleries
  ALTER COLUMN download_quality SET DEFAULT 'webp';

COMMENT ON COLUMN galleries.download_quality IS
  'Allowed client download file format: webp, original, or both. Defaults to webp so originals are only exposed when explicitly allowed.';
