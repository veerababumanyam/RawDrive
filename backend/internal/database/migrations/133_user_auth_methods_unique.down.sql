-- Migration 133 (down): drop the user_auth_methods uniqueness guarantees and
-- remove the Google OAuth state-key setting slot.
--
-- The de-duplication performed by the up migration is intentionally NOT
-- reversed — collapsed duplicate link rows cannot be reconstructed and were
-- functionally redundant. Only the constraints, indexes, and the seeded
-- platform setting are removed.

-- Drop the mirrored explicit indexes first.
DROP INDEX IF EXISTS idx_user_auth_methods_user_provider;
DROP INDEX IF EXISTS idx_user_auth_methods_provider_subject;

-- Drop the named uniqueness constraints (these own their backing indexes).
ALTER TABLE user_auth_methods
    DROP CONSTRAINT IF EXISTS user_auth_methods_user_provider_unique;

ALTER TABLE user_auth_methods
    DROP CONSTRAINT IF EXISTS user_auth_methods_provider_subject_unique;

-- Remove the seeded Google OAuth state-cookie signing key slot.
DELETE FROM platform_settings
WHERE category = 'auth' AND key = 'google_oauth_state_key';
