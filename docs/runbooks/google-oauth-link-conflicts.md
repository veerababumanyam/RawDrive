# Google OAuth Link Conflicts

| Field | Value |
| --- | --- |
| Feature | Google OAuth login |
| Primary symptom | Login redirects to `/login?error=oauth_*_conflict` |
| First check | Google Console redirect URI exactly matches `GOOGLE_REDIRECT_URL` |
| Likely cause when local works | Production `user_auth_methods` data differs from local |

## Google Console Baseline

For production, the OAuth web client must include:

- Authorized JavaScript origins: `https://rawdrive.in` and `https://www.rawdrive.in`
- Authorized redirect URI: `https://api.rawdrive.in/auth/oauth/google/callback`

Local development may also include localhost origins and callbacks. If the
production callback is missing or does not exactly match the backend
`GOOGLE_REDIRECT_URL`, Google usually fails with `redirect_uri_mismatch` or
RawDrive returns `oauth_config_unavailable` / `oauth_token_invalid`. It should
not return an account-link conflict.

## Error Codes

- `oauth_account_not_activated`: the email exists locally but the RawDrive
  registration was never activated. Do not auto-link Google to this row.
- `oauth_google_link_conflict`: the Google identity is already linked to a
  different RawDrive user.
- `oauth_rawdrive_link_conflict`: the RawDrive user found by email already has
  a different Google identity linked. This is the common production-data drift
  case when local login works but production login does not.
- `oauth_account_conflict`: legacy generic conflict. Treat it as ambiguous and
  run the checks below.

## Diagnose

Connect to the production database with the migrations/support role. Do not
paste secrets into tickets or chat.

```sql
\set affected_email 'user@example.com'

SELECT
  u.id,
  u.email,
  u.email_verified,
  (u.password_hash IS NOT NULL AND u.password_hash <> '') AS has_password,
  m.id AS auth_method_id,
  m.provider,
  m.provider_subject
FROM users u
LEFT JOIN user_auth_methods m
  ON m.user_id = u.id
 AND m.provider = 'google'
WHERE lower(u.email) = lower(:'affected_email');
```

Check for older duplicate auth-method data:

```sql
SELECT provider, provider_subject, count(*) AS links, array_agg(user_id) AS user_ids
FROM user_auth_methods
WHERE provider = 'google'
GROUP BY provider, provider_subject
HAVING count(*) > 1;

SELECT user_id, provider, count(*) AS links, array_agg(provider_subject) AS subjects
FROM user_auth_methods
WHERE provider = 'google'
GROUP BY user_id, provider
HAVING count(*) > 1;
```

## Remediate

### Account Not Activated

If `email_verified = false`, do not mark it verified solely because a Google
login was attempted. Have the user complete the registration activation flow.
If the row is abandoned pre-registration data, support may delete it only after
confirming there are no owned workspaces or dependent records.

### RawDrive Account Linked To A Different Google Identity

Use this when the affected user row is verified, support has confirmed the
user owns the email address, and the current Google link is stale or wrong.
Removing the stale link lets the next Google login create a fresh link for the
same RawDrive account.

```sql
BEGIN;

DELETE FROM user_auth_methods
WHERE user_id = '<affected-user-uuid>'
  AND provider = 'google';

COMMIT;
```

Ask the user to start Google sign-in again after the transaction commits.

### Google Identity Linked To Another RawDrive User

Do not move the link blindly. First identify which RawDrive user owns the
existing link, confirm which account should survive, and escalate to the
platform owner if workspace ownership or billing records would move.

## Validate

- The user can complete Google login on `https://rawdrive.in`.
- The login no longer redirects with an `oauth_*_conflict` query parameter.
- The user lands in the expected workspace, role, and platform role.
- `user_auth_methods` has exactly one `provider = 'google'` row for that user.
