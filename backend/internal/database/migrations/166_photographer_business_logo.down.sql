-- 166_photographer_business_logo (down)
ALTER TABLE photographer_profiles
  DROP COLUMN IF EXISTS business_logo_url,
  DROP COLUMN IF EXISTS business_logo_rendered_url,
  DROP COLUMN IF EXISTS business_logo_position,
  DROP COLUMN IF EXISTS business_logo_uploaded_at;
