-- Migration 155: public personal photographer profiles.
--
-- The project has users + workspaces, not a separate photographers table, so
-- photographer_id intentionally references users(id). One photographer gets one
-- publishable profile per workspace.

CREATE TABLE IF NOT EXISTS photographer_profiles (
  profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),

  first_name VARCHAR(100),
  last_name VARCHAR(100),
  display_name VARCHAR(200)
    GENERATED ALWAYS AS (btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) STORED,
  professional_title VARCHAR(255),
  tagline VARCHAR(500),

  avatar_url VARCHAR(500),
  avatar_cropped_url VARCHAR(500),
  avatar_position JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1,"aspect":1}'::jsonb,
  avatar_uploaded_at TIMESTAMPTZ,

  cover_url VARCHAR(500),
  cover_position JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,

  short_bio VARCHAR(500),
  long_bio TEXT,

  primary_email VARCHAR(255),
  primary_phone VARCHAR(20),
  whatsapp_number VARCHAR(20),
  secondary_email VARCHAR(255),
  contact_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,

  primary_city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100) DEFAULT 'India',
  postal_code VARCHAR(20),
  service_radius_km INTEGER,
  travel_availability VARCHAR(50),
  covered_cities TEXT[] NOT NULL DEFAULT '{}',

  years_experience INTEGER,
  start_date DATE,
  total_weddings_shot INTEGER,
  photography_styles TEXT[] NOT NULL DEFAULT '{}',
  specializations TEXT[] NOT NULL DEFAULT '{}',
  languages_spoken TEXT[] NOT NULL DEFAULT '{}',
  equipment JSONB NOT NULL DEFAULT '{}'::jsonb,

  starting_price INTEGER,
  price_range_max INTEGER,
  custom_quote_available BOOLEAN NOT NULL DEFAULT true,
  payment_terms TEXT,
  deposit_required BOOLEAN NOT NULL DEFAULT true,
  deposit_amount INTEGER,
  packages JSONB NOT NULL DEFAULT '[]'::jsonb,

  featured_galleries UUID[] NOT NULL DEFAULT '{}',
  category_galleries JSONB NOT NULL DEFAULT '{}'::jsonb,
  best_work_photos UUID[] NOT NULL DEFAULT '{}',

  testimonials JSONB NOT NULL DEFAULT '[]'::jsonb,
  video_testimonials TEXT[] NOT NULL DEFAULT '{}',
  average_rating DOUBLE PRECISION,

  social_instagram VARCHAR(255),
  social_facebook VARCHAR(255),
  social_twitter VARCHAR(255),
  social_linkedin VARCHAR(255),
  social_youtube VARCHAR(255),
  social_pinterest VARCHAR(255),
  custom_links JSONB NOT NULL DEFAULT '[]'::jsonb,

  awards JSONB NOT NULL DEFAULT '[]'::jsonb,
  certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  memberships JSONB NOT NULL DEFAULT '[]'::jsonb,
  featured_in TEXT[] NOT NULL DEFAULT '{}',

  business_name VARCHAR(255),
  gst_number VARCHAR(20),
  company_registration VARCHAR(50),
  business_address TEXT,
  invoice_logo_url VARCHAR(500),
  payment_methods TEXT[] NOT NULL DEFAULT '{}',

  is_public BOOLEAN NOT NULL DEFAULT false,
  visibility_config JSONB NOT NULL DEFAULT '{
    "show_profile_photo": true,
    "show_name": true,
    "show_tagline": true,
    "show_location": true,
    "show_bio": true,
    "show_galleries": true,
    "show_reviews": true,
    "show_pricing": false,
    "show_email": true,
    "show_phone": false,
    "show_whatsapp": true,
    "show_socials": true,
    "show_awards": true,
    "show_services": true,
    "show_equipment": false,
    "show_custom_links": true
  }'::jsonb,

  meta_title VARCHAR(150),
  meta_description VARCHAR(500),
  meta_keywords TEXT[] NOT NULL DEFAULT '{}',
  og_image_url VARCHAR(500),
  url_slug VARCHAR(100),

  selected_theme VARCHAR(50) NOT NULL DEFAULT 'minimal',
  brand_color VARCHAR(20) DEFAULT '#10576a',
  brand_font VARCHAR(50) DEFAULT 'Inter',
  background_photo_url VARCHAR(500),
  layout_style VARCHAR(50) NOT NULL DEFAULT 'grid',
  button_style VARCHAR(50) NOT NULL DEFAULT 'rounded',

  total_profile_views INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  avg_click_through_rate DOUBLE PRECISION,
  conversion_rate DOUBLE PRECISION,
  top_traffic_sources JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT photographer_profiles_one_per_workspace_user
    UNIQUE (workspace_id, photographer_id),
  CONSTRAINT photographer_profiles_slug_shape
    CHECK (
      url_slug IS NULL OR (
        char_length(url_slug) BETWEEN 3 AND 100
        AND url_slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
        AND url_slug !~ '--'
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_photographer_profiles_slug_unique
  ON photographer_profiles (lower(url_slug))
  WHERE url_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_photographer_profiles_photographer
  ON photographer_profiles (photographer_id);

CREATE INDEX IF NOT EXISTS idx_photographer_profiles_workspace
  ON photographer_profiles (workspace_id);

CREATE INDEX IF NOT EXISTS idx_photographer_profiles_public_slug
  ON photographer_profiles (lower(url_slug), status, is_public)
  WHERE url_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_photographer_profiles_featured_galleries
  ON photographer_profiles USING gin (featured_galleries);

CREATE TABLE IF NOT EXISTS photographer_profile_view_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES photographer_profiles(profile_id) ON DELETE CASCADE,
  visitor_hash TEXT NOT NULL,
  source TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_photographer_profile_view_events_profile_created
  ON photographer_profile_view_events (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_photographer_profile_view_events_unique
  ON photographer_profile_view_events (profile_id, visitor_hash);
