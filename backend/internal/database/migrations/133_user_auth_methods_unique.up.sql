-- Migration 133: enforce uniqueness on user_auth_methods (S1-G2 / AREA-AUTH-3).
--
-- Migration 003 created user_auth_methods with NO unique constraint. Without
-- one, the same Google identity (provider, provider_subject) could be linked to
-- multiple local accounts, and the OAuth callback's identity resolution by
-- provider-subject is ambiguous / spoofable. This adds:
--
--   * UNIQUE (provider, provider_subject) — one Google "sub" maps to exactly one
--     local account. This is the constraint the callback relies on to resolve a
--     repeat OAuth login by the stable subject instead of the mutable email.
--   * UNIQUE (user_id, provider)          — a given local account links at most
--     one identity per provider (no two Google subjects on one account).
--
-- De-dup first: collapse any pre-existing duplicate rows so the constraints can
-- be added on a dirty table. We keep the lowest ctid per group and delete the
-- rest. This is safe because duplicate auth-method rows are functionally
-- identical link records (same user/provider/subject) or — for the user_id+
-- provider case — an unintended multi-link we deliberately collapse to one.

-- Collapse exact (provider, provider_subject) duplicates, keeping one row.
DELETE FROM user_auth_methods a
USING user_auth_methods b
WHERE a.ctid > b.ctid
  AND a.provider = b.provider
  AND a.provider_subject = b.provider_subject;

-- Collapse (user_id, provider) duplicates (different subjects on one account),
-- keeping the earliest row by ctid.
DELETE FROM user_auth_methods a
USING user_auth_methods b
WHERE a.ctid > b.ctid
  AND a.user_id = b.user_id
  AND a.provider = b.provider;

-- Backfill: any account already linked to a verified Google identity is, by
-- definition, an owner-verified email — mark it verified so OAuth logins are
-- not blocked by the "account not activated" gate.
UPDATE users
SET email_verified = TRUE,
    updated_at = now()
WHERE email_verified = FALSE
  AND EXISTS (
      SELECT 1
      FROM user_auth_methods
      WHERE user_auth_methods.user_id = users.id
        AND user_auth_methods.provider = 'google'
  );

-- Named UNIQUE constraints are the authoritative integrity guarantee the OAuth
-- callback relies on (S1-G2 / AREA-AUTH-3): one Google subject -> one local
-- account, and at most one identity per provider per account.
ALTER TABLE user_auth_methods
    ADD CONSTRAINT user_auth_methods_provider_subject_unique
    UNIQUE (provider, provider_subject);

ALTER TABLE user_auth_methods
    ADD CONSTRAINT user_auth_methods_user_provider_unique
    UNIQUE (user_id, provider);

-- Mirror the same uniqueness as explicitly-named indexes. The constraints above
-- already create backing indexes, so these are defensive/idempotent (and keep
-- the index names stable for tooling and migrations that reference them).
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_auth_methods_provider_subject
    ON user_auth_methods (provider, provider_subject);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_auth_methods_user_provider
    ON user_auth_methods (user_id, provider);

-- Seed the Google OAuth state-cookie signing key slot (empty by default; the
-- value is provisioned via platform_settings or GOOGLE_OAUTH_STATE_KEY). This
-- key signs the OAuth state/nonce cookie so the callback can verify it.
INSERT INTO platform_settings (category, key, value, is_secret, description)
VALUES ('auth', 'google_oauth_state_key', '', true, 'Google OAuth state cookie signing key')
ON CONFLICT (category, key) DO NOTHING;
