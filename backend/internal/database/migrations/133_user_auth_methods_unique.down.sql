DROP INDEX IF EXISTS idx_user_auth_methods_user_provider;
DROP INDEX IF EXISTS idx_user_auth_methods_provider_subject;

DELETE FROM platform_settings
WHERE category = 'auth' AND key = 'google_oauth_state_key';
