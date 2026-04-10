-- F-007 (M17 hardening wave 1): TOTP MFA for photographers + staff.
-- Stores per-user TOTP secrets (envelope-encrypted at the application layer via F-005)
-- and one-time recovery codes (bcrypt-hashed).
-- Decision packet: docs/superpowers/plans/2026-04-11-m17-decision-packet.md §3.1

CREATE TABLE user_mfa_enrollments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  totp_secret_ct      bytea NOT NULL,         -- envelope-encrypted ciphertext (F-005 DEK)
  totp_secret_dek_id  text NOT NULL,          -- DEK identifier for decryption
  totp_issuer         text NOT NULL,          -- matches auth.mfa_issuer_name platform_setting
  enrolled_at         timestamptz NOT NULL DEFAULT now(),
  last_verified_at    timestamptz,
  disabled_at         timestamptz             -- soft-disable without losing audit trail
);

CREATE TABLE user_mfa_recovery_codes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash      text NOT NULL,                 -- bcrypt hash of the plaintext code
  consumed_at    timestamptz,                   -- non-null once used (one-time)
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_mfa_recovery_codes_user
  ON user_mfa_recovery_codes(user_id)
  WHERE consumed_at IS NULL;

-- Grace window for users already logged in when M17 deploys.
-- NULL = no grace window (new enrollments start required immediately).
-- Non-null future timestamp = user has until that moment to enroll before login is blocked.
ALTER TABLE users ADD COLUMN mfa_grace_until timestamptz;
