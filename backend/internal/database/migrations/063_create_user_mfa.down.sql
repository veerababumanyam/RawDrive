-- F-007 (M17 hardening wave 1): rollback TOTP MFA tables.
ALTER TABLE users DROP COLUMN IF EXISTS mfa_grace_until;
DROP INDEX IF EXISTS idx_user_mfa_recovery_codes_user;
DROP TABLE IF EXISTS user_mfa_recovery_codes;
DROP TABLE IF EXISTS user_mfa_enrollments;
