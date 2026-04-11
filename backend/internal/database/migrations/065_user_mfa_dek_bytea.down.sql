ALTER TABLE user_mfa_enrollments DROP COLUMN totp_secret_dek_wrapped;
ALTER TABLE user_mfa_enrollments ADD COLUMN totp_secret_dek_id TEXT NOT NULL DEFAULT '';
ALTER TABLE user_mfa_enrollments ALTER COLUMN totp_secret_dek_id DROP DEFAULT;
