# ISSUE-002 — SMTP real-provider verification (operator attestation)

> **Status:** empty scaffold, waiting for operator sign-off.
> **Purpose:** record evidence that the SMTP transport wired in
> commits `64f0ca2` + `c481200` actually delivers mail through a real
> external provider (not just Mailpit). This is the "evidence
> uplift" the `docs/issuestofix.md` item #6 and the brownfield fix
> wave review §5.1 both asked for but which this repo cannot
> automate — it needs operator-supplied provider credentials.
> **Source procedure:** `docs/brownfield/meta-issues-clarification.md`
> lines 152–176 ("SMTP end-to-end verification against a real
> provider"). Follow those steps and record the outcome here.

## Why this file exists

The in-repo test `TestSMTPRealDelivery_OTPLandsInMailpit` at
`backend/tests/integration/smtp_delivery_real_test.go:168` proves
that:

- `email.NewOTPDelivery(cfg)` produces an RFC 5322–valid message
- `defaultMailer` (which is `net/smtp.SendMail`) successfully
  transmits it over TCP to a listening SMTP server
- Mailpit receives and parses the message with the expected
  Subject, From, and body

What it does NOT prove:

- **STARTTLS** — Mailpit on `:1025` accepts plaintext SMTP. No
  upgrade is exercised.
- **PLAIN auth** — Mailpit has no auth. The `smtpAuth` helper
  returns `nil` for the Mailpit path.
- **DKIM** — the From address is `smoke-test@rawdrive.test`, a
  made-up domain with no DNS records.
- **Provider deliverability** — Postmark/SES/Mailgun have their own
  reputation systems, bounce handling, and delivery rules.

A real-provider run closes those gaps. Fill in the tables below
after running the procedure against at least one production-grade
provider.

## Prerequisites

- [ ] A Postmark / Mailgun / Amazon SES account with a verified
      sending domain
- [ ] SMTP credentials for that account (host, port 587 or 465,
      username, password)
- [ ] An inbox on a domain you control. **Not** `@example.com` or
      `@rawdrive.test`. Use a real mailbox you can read.
- [ ] RawDrive backend running locally or in a staging env with the
      real provider's env vars set:
      - `SMTP_HOST`
      - `SMTP_PORT`
      - `SMTP_USERNAME`
      - `SMTP_PASSWORD`
      - `SMTP_FROM`
      - (optional) `SMTP_FROM_NAME`
- [ ] `DEV_STUB_EMAIL` is **not** set to `true` (otherwise the
      backend falls back to the stdout stub and nothing actually
      sends)
- [ ] **`platform_settings` DB rows do not shadow your env vars.**
      `backend/internal/email/smtp.go:117-133` resolves each SMTP
      setting (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`,
      `smtp_from`, `smtp_from_name`) by reading the `platform_settings`
      table FIRST, then falling back to the env var (`SMTP_HOST`,
      `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`,
      `SMTP_FROM_NAME`). If there are stale rows for any of those
      keys in `platform_settings`, they will override your
      `.env.cobolt` values SILENTLY and the OTP will go out via the
      wrong credentials — this is the most common "I set the env var,
      why is it still broken" failure mode for this procedure. Before
      booting: either clear those rows
      (`DELETE FROM platform_settings WHERE category = 'email'`)
      or update them to match the env vars you are about to use.
- [ ] `APP_ENV` is set to something other than `production` unless
      you are deliberately testing against the production env

## Procedure — OTP registration

Recipient inbox: `__TODO: fill in__` (a mailbox you can read)

1. [ ] Boot the backend. Confirm the log line
       `Email: SMTP transport wired to <host>:<port> (from=<addr>)`
       appears at startup. If you see
       `WARNING: Email stubs active`, stop — your env vars are not
       being picked up.
2. [ ] From a test client (curl, Postman, or the real frontend),
       call `POST /auth/register` with the recipient inbox as the
       email.
3. [ ] Note the timestamp of the request.
4. [ ] Open the recipient inbox and confirm the OTP email lands
       within 30 seconds.
5. [ ] Open the message source ("Show original" in Gmail, "View
       headers" in other clients) and check:
       - `Authentication-Results: ... dkim=pass` — DKIM signature
         is valid (requires DNS records on the sending domain)
       - `From:` matches `SMTP_FROM`
       - `Subject:` contains "verification code"
       - Body contains the expected code
6. [ ] Copy the code from the email and confirm you can complete
       the OTP verification via `POST /auth/verify-otp`.

### Result

| Field | Value |
|---|---|
| Provider | `__TODO__` (e.g. Postmark / SES / Mailgun) |
| Sending domain | `__TODO__` |
| Recipient inbox | `__TODO__` |
| Request timestamp (UTC) | `__TODO__` |
| Delivery latency | `__TODO__` (seconds from request to inbox) |
| DKIM status | `__TODO__` (pass / fail / none) |
| SPF status | `__TODO__` (pass / fail / none) |
| DMARC status | `__TODO__` (pass / fail / none) |
| Body format intact | `__TODO__` (yes / no) |
| Code verified via `/auth/verify-otp` | `__TODO__` (yes / no) |
| Operator initials | `__TODO__` |
| Attestation date | `__TODO__` |

## Procedure — Team invitation

Recipient inbox: `__TODO: fill in__` (can be the same as above)

1. [ ] Register a workspace owner account (can use the OTP verified
       in the previous procedure).
2. [ ] From that account, issue a team invitation to the recipient
       inbox via the workspace settings UI (or the corresponding
       API endpoint).
3. [ ] Note the timestamp.
4. [ ] Confirm the invitation email lands within 30 seconds.
5. [ ] Confirm the Subject contains "invited to a RawDrive
       workspace".
6. [ ] Click the accept-invite link in the body and confirm it
       resolves to a working RawDrive page.

### Result

| Field | Value |
|---|---|
| Provider | `__TODO__` |
| Request timestamp (UTC) | `__TODO__` |
| Delivery latency | `__TODO__` |
| Accept-invite link resolved | `__TODO__` (yes / no) |
| Operator initials | `__TODO__` |
| Attestation date | `__TODO__` |

## Optional — restart resilience

1. [ ] Complete one OTP send.
2. [ ] Restart the backend.
3. [ ] Immediately send another OTP (to a new unique address).
4. [ ] Confirm the second OTP also lands.
5. [ ] Confirm there is no env-var caching regression — if the
       second send fails with "SMTP config error", the SettingsReader
       path is in play and the documented env-only boot path is
       broken. File a new issue.

| Field | Value |
|---|---|
| Second delivery landed after restart | `__TODO__` (yes / no) |
| Operator initials | `__TODO__` |
| Attestation date | `__TODO__` |

## Sign-off

Once every `__TODO__` above is filled in with a real value, this
file counts as evidence that ISSUE-002 is not just code-complete
but also runtime-complete against a real provider. Commit this
file alongside any related infra changes.

If the procedure reveals a bug (DKIM fails, body is corrupted,
auth is rejected), do not fill in a false "yes" — open a new issue,
link it here, and leave this attestation unsigned.
