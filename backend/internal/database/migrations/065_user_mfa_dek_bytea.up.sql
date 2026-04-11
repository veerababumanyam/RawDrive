-- F-007 (M17 wave 2): fix user_mfa_enrollments dek column type.
-- Wave 1 migration 063 created totp_secret_dek_id as TEXT, but the F-005
-- envelope encryption API returns the wrapped DEK as raw bytes. Storing
-- it as text would force hex encoding round-trips for no good reason.
-- The table has zero rows at this point (wave 1 landed the schema but
-- nothing writes to it yet), so DROP+ADD is safe without data migration.

ALTER TABLE user_mfa_enrollments DROP COLUMN totp_secret_dek_id;
ALTER TABLE user_mfa_enrollments ADD COLUMN totp_secret_dek_wrapped bytea NOT NULL DEFAULT E'\\x';
ALTER TABLE user_mfa_enrollments ALTER COLUMN totp_secret_dek_wrapped DROP DEFAULT;
