-- 166_photographer_business_logo (up)
-- Public business-logo image for the photographer profile / link-in-bio page.
-- These are PUBLIC brand marks (shown on /p/{slug}) and are intentionally NOT
-- end-to-end encrypted like gallery assets — they follow the same plaintext,
-- presigned-public path as the avatar columns added in 163_photographer_profiles.
-- business_logo_position uses aspect=0 to mean "preserve source aspect"
-- (free-aspect, fit-to-contain), distinct from the avatar's square (aspect=1).
ALTER TABLE photographer_profiles
  ADD COLUMN IF NOT EXISTS business_logo_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS business_logo_rendered_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS business_logo_position JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1,"aspect":0}'::jsonb,
  ADD COLUMN IF NOT EXISTS business_logo_uploaded_at TIMESTAMPTZ;
