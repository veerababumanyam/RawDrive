-- F-007 (M17 hardening wave 2): persist mfa_verified state on refresh sessions.
-- Without this column, RotateRefreshToken would silently downgrade any MFA-
-- verified session to mfa_verified=false on every access-token refresh,
-- forcing platform staff back to the TOTP prompt every 15 minutes once
-- the middleware enforcement lands.
--
-- Default FALSE so existing rows (created before this migration) parse as
-- "not MFA-verified" — the safe default.

ALTER TABLE refresh_sessions
  ADD COLUMN IF NOT EXISTS mfa_verified BOOLEAN NOT NULL DEFAULT FALSE;
