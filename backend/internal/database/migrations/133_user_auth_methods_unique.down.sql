-- Migration 133 (down): drop the user_auth_methods uniqueness constraints.
--
-- The de-duplication performed by the up migration is intentionally NOT
-- reversed — collapsed duplicate link rows cannot be reconstructed and were
-- functionally redundant. Only the constraints are removed.

ALTER TABLE user_auth_methods
    DROP CONSTRAINT IF EXISTS user_auth_methods_user_provider_unique;

ALTER TABLE user_auth_methods
    DROP CONSTRAINT IF EXISTS user_auth_methods_provider_subject_unique;
