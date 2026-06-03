# 2026-06-02 Activation OTP SMTP 535

## Summary

Activation OTP delivery failed for an unverified RawDrive account even though
`POST /auth/resend-otp` returned the public generic success response.

The backend was generating registration OTPs, but SecureServer rejected the
configured SMTP credential with `535 Authentication Failed`. Because resend
feedback is intentionally generic, the user-facing endpoint did not expose the
SMTP failure.

## Impact

- Affected users could not activate newly registered accounts while the invalid
  SMTP credential was active.
- Login for unverified accounts correctly remained blocked with "account not
  activated".
- No OTP login path was added or needed.

## Root Cause

The production SMTP credential for `noreply@rawdrive.in` was invalid or out of
sync between the mail provider, app node env files, and encrypted
`platform_settings.email.smtp_password`.

`platform_settings` takes precedence over env, so fixing only one layer is not
enough. Credential rotation must update env on both app nodes and then sync the
encrypted email settings into the shared database.

## Detection

- Backend logs showed `535 Authentication Failed`.
- `auth_otp_codes` did not retain an active row for failed sends because the
  backend deletes unsent generated codes.
- Direct SMTP smoke testing reproduced provider rejection before the credential
  was corrected.

## Resolution

1. Corrected the SecureServer SMTP credential in production env on both app
   nodes.
2. Synced only the email category into encrypted `platform_settings` with:

   ```bash
   sync-platform-settings-from-env \
     --category email \
     --keys smtp_host,smtp_port,smtp_user,smtp_password,smtp_security,smtp_from,smtp_from_name
   ```

3. Deployed the updated backend/frontend/tooling images.
4. Ran `smtp-smoke --to <operator-inbox>` successfully from both app nodes.
5. Triggered a real activation resend and confirmed an active registration OTP
   row existed for the target email.

## Prevention

- Keep `docs/runbooks/smtp-otp-delivery.md` as the operational source of truth
  for activation OTP delivery.
- Run `smtp-smoke` from both app nodes after every SMTP credential rotation,
  deploy, or provider change.
- Use filtered `sync-platform-settings-from-env` for secret rotations so
  unrelated platform settings are not overwritten.
- Preserve generic public resend responses; diagnose SMTP failures through logs,
  smoke tests, and database checks.
- Never commit, paste, or log SMTP passwords. If a credential is shared in a
  collaborative channel during emergency repair, rotate it again after service
  is restored.

## Regression Coverage

- `backend/internal/auth/persistent_otp_test.go` verifies failed SMTP sends
  delete unsent registration OTP rows and do not consume resend quota.
- `backend/cmd/sync-platform-settings-from-env/main_test.go` verifies filtered
  sync and dry-run behavior without leaking secret values.
- `backend/internal/database/migrations/m139_migrations_test.go` protects the
  migration that prevents seeded SMTP transport defaults from shadowing env
  fallback when `smtp_host` is empty.
