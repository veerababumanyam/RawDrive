DELETE FROM user_auth_methods a
USING user_auth_methods b
WHERE a.ctid > b.ctid
  AND a.user_id = b.user_id
  AND a.provider = b.provider
  AND a.provider_subject = b.provider_subject;

UPDATE users
SET email_verified = TRUE,
    updated_at = now()
WHERE email_verified = FALSE
  AND EXISTS (
      SELECT 1
      FROM user_auth_methods
      WHERE user_auth_methods.user_id = users.id
        AND user_auth_methods.provider = 'google'
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_auth_methods_provider_subject
    ON user_auth_methods (provider, provider_subject);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_auth_methods_user_provider
    ON user_auth_methods (user_id, provider);

INSERT INTO platform_settings (category, key, value, is_secret, description)
VALUES ('auth', 'google_oauth_state_key', '', true, 'Google OAuth state cookie signing key')
ON CONFLICT (category, key) DO NOTHING;
