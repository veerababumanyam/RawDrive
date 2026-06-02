ALTER TABLE galleries
  ALTER COLUMN download_quality SET DEFAULT 'original';

COMMENT ON COLUMN galleries.download_quality IS
  'Allowed client download file format: webp, original, or both.';
