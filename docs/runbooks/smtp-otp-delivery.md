# SMTP OTP Delivery Runbook

Use this when activation OTPs or password-reset emails are not arriving, or
when backend logs show SMTP authentication errors such as `535 Authentication
Failed`.

## Incident Memory: 2026-06-02 Activation OTP Failure

Symptom: `/auth/resend-otp` returned generic success for an unverified account,
but Gmail did not receive the activation code.

Root cause: SecureServer rejected SMTP auth for `noreply@rawdrive.in` with
`535 Authentication Failed`. This was a provider credential/configuration
problem, not an OTP validation problem.

Resolution: rotate/correct the mailbox credential, update `/opt/rawdrive/app/.env`
on both app nodes, sync only the `email.*` platform settings from env, run
`smtp-smoke` from both nodes, and trigger a real resend.

Lessons locked into code:

- Failed registration OTP sends delete the unsent `auth_otp_codes` row so stale
  codes are not left active.
- Public resend feedback remains generic to avoid account enumeration.
- `smtp-smoke` is the operator check for provider auth, TLS, DB decryption, and
  network egress.
- `sync-platform-settings-from-env --category email --keys ...` prevents a
  secret rotation from accidentally rewriting unrelated service settings.

## Current Production Contract

- Provider: SecureServer SMTP.
- Host: `smtpout.secureserver.net`
- Port/security: `465` / `ssl`
- Username/from: `noreply@rawdrive.in`
- Public resend endpoint: `POST /auth/resend-otp`
- Public response stays generic for account-enumeration safety.
- Source of truth order: encrypted `platform_settings.email.*` first, then
  `SMTP_*` environment variables.

Never paste SMTP passwords into tickets, chat, logs, or committed files.
If a password was pasted into a collaborative channel during emergency repair,
rotate it again after service is restored and repeat this runbook.

## Rotate Or Correct The SMTP Password

1. Reset or create a valid mailbox/app password for `noreply@rawdrive.in` in
   the mail provider dashboard.
2. On both app nodes, edit `/opt/rawdrive/app/.env` and set:

   ```dotenv
   SMTP_HOST=smtpout.secureserver.net
   SMTP_PORT=465
   SMTP_USERNAME=noreply@rawdrive.in
   SMTP_PASSWORD=<rotated-secret>
   SMTP_SECURITY=ssl
   SMTP_FROM=noreply@rawdrive.in
   SMTP_FROM_NAME=RawDrive
   ```

3. From one app node only, sync the email category into encrypted
   `platform_settings`:

   ```bash
   cd /opt/rawdrive/app/deploy
   docker compose -f docker-compose.prod-app.yml run --rm --no-deps backend \
     /usr/local/bin/sync-platform-settings-from-env \
       --category email \
       --keys smtp_host,smtp_port,smtp_user,smtp_password,smtp_security,smtp_from,smtp_from_name
   ```

4. Dry-run before a future rotation when you only want to inspect selected
   writes:

   ```bash
   docker compose -f docker-compose.prod-app.yml run --rm --no-deps backend \
     /usr/local/bin/sync-platform-settings-from-env \
       --dry-run \
       --category email \
       --keys smtp_password
   ```

## Smoke-Test SMTP

Run from both app nodes so DNS, network egress, DB decryption, and provider
auth are tested from each production path:

```bash
cd /opt/rawdrive/app/deploy
docker compose -f docker-compose.prod-app.yml run --rm --no-deps backend \
  /usr/local/bin/smtp-smoke --to <operator-inbox>
```

Expected result:

- Command exits `0`.
- Logs show `SMTP smoke succeeded`.
- Operator inbox receives the smoke email.
- Logs do not show `535 Authentication Failed`.

## Verify Activation Resend

Trigger one real resend for the affected unverified account:

```bash
curl -fsS https://api.rawdrive.in/auth/resend-otp \
  -H 'Content-Type: application/json' \
  --data '{"email":"manyamgermany@gmail.com"}'
```

Then check there is an active registration OTP row:

```bash
ssh root@187.127.142.46 \
  "docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -P pager=off -c \
  \"SELECT purpose, identifier, created_at, expires_at, used_at IS NOT NULL AS used
     FROM auth_otp_codes
    WHERE purpose='registration'
      AND identifier=lower('manyamgermany@gmail.com')
      AND used_at IS NULL
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;\""
```

If the endpoint returns `200` but no row remains, inspect backend logs on both
app nodes:

```bash
cd /opt/rawdrive/app/deploy
docker compose -f docker-compose.prod-app.yml logs --since=15m backend \
  | grep -Ei 'auth\.ResendOTP|auth\.Register|SMTP|smtp|535'
```

`535 Authentication Failed` means the provider rejected the configured
username/password pair. Rotate the password and sync `platform_settings` again.

If multiple active registration rows exist for the same email after repeated
resends, the newest code is the one the user should enter. Ask the user to use
the latest email and ignore older codes.
