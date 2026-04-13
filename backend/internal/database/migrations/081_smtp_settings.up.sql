-- Add explicit admin-editable SMTP transport metadata.
--
-- Older installs already have smtp_host/port/user/password/from from
-- migration 039. These rows keep TLS mode and sender display name in
-- platform_settings too, so admins can update the complete SMTP setup
-- without changing source code or redeploying.

INSERT INTO platform_settings (category, key, value, is_secret, description) VALUES
  ('email', 'smtp_security', 'ssl', false, 'SMTP security mode: auto, ssl, or starttls'),
  ('email', 'smtp_from_name', 'RawDrive', false, 'Default sender display name')
ON CONFLICT (category, key) DO NOTHING;
