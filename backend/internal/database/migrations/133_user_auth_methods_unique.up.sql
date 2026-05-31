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

ALTER TABLE user_auth_methods
    ADD CONSTRAINT user_auth_methods_provider_subject_unique
    UNIQUE (provider, provider_subject);

ALTER TABLE user_auth_methods
    ADD CONSTRAINT user_auth_methods_user_provider_unique
    UNIQUE (user_id, provider);
