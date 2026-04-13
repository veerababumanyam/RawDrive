-- Platform Settings: admin-managed service configurations
-- Secrets are encrypted at rest using AES-256-GCM (encryption handled in Go service layer)
-- Lookup order: database → environment variables → fail with error

CREATE TABLE IF NOT EXISTS platform_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,           -- 'storage', 'auth', 'payments', 'ai', 'email', 'messaging'
    key TEXT NOT NULL,                -- 'r2_bucket_name', 'google_client_id', etc.
    value TEXT NOT NULL DEFAULT '',   -- encrypted if is_secret=true
    is_secret BOOLEAN NOT NULL DEFAULT false,
    description TEXT,                 -- human-readable description for admin UI
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(category, key)
);

CREATE INDEX idx_platform_settings_category ON platform_settings (category);

-- Seed with categories (values come from env vars, admin can override)
INSERT INTO platform_settings (category, key, value, is_secret, description) VALUES
  -- Storage (Cloudflare R2)
  ('storage', 'driver', 's3', false, 'Storage driver (s3 for Cloudflare R2)'),
  ('storage', 'r2_bucket_name', '', false, 'R2 bucket name'),
  ('storage', 'r2_region', 'auto', false, 'R2 region'),
  ('storage', 'r2_endpoint', '', false, 'R2 endpoint URL'),
  ('storage', 'r2_access_key_id', '', true, 'R2 access key ID (encrypted)'),
  ('storage', 'r2_secret_access_key', '', true, 'R2 secret access key (encrypted)'),
  ('storage', 'r2_public_url', '', false, 'R2 public CDN URL for signed URLs'),
  -- Auth (Google OAuth)
  ('auth', 'google_client_id', '', false, 'Google OAuth client ID'),
  ('auth', 'google_client_secret', '', true, 'Google OAuth client secret (encrypted)'),
  ('auth', 'google_redirect_url', '', false, 'Google OAuth redirect URL'),
  -- Payments (PhonePe)
  ('payments', 'phonepe_merchant_id', '', false, 'PhonePe merchant ID'),
  ('payments', 'phonepe_salt_key', '', true, 'PhonePe salt key (encrypted)'),
  ('payments', 'phonepe_salt_index', '1', false, 'PhonePe salt index'),
  ('payments', 'phonepe_env', 'SANDBOX', false, 'PhonePe environment (SANDBOX or PRODUCTION)'),
  -- AI (Gemini)
  ('ai', 'gemini_api_key', '', true, 'Google Gemini API key (encrypted)'),
  ('ai', 'gemini_model_id', 'gemini-2.0-flash', false, 'Gemini model ID'),
  ('ai', 'ai_encryption_key', '', true, 'AES key for AI config encryption (encrypted)'),
  -- Email (SMTP)
  ('email', 'smtp_host', '', false, 'SMTP server host'),
  ('email', 'smtp_port', '465', false, 'SMTP server port'),
  ('email', 'smtp_user', '', false, 'SMTP username'),
  ('email', 'smtp_password', '', true, 'SMTP password (encrypted)'),
  ('email', 'smtp_security', 'ssl', false, 'SMTP security mode: auto, ssl, or starttls'),
  ('email', 'smtp_from', 'noreply@rawdrive.in', false, 'Default sender email'),
  ('email', 'smtp_from_name', 'RawDrive', false, 'Default sender display name')
ON CONFLICT (category, key) DO NOTHING;
