-- 130 — F-001 plaintext-password backfill (audit 2026-05-30).
--
-- Before the F-001 code fix (Wave 1), passwordService.ResetPassword wrote the
-- new password VERBATIM into users.password_hash. Any account whose password
-- was changed via the forgot-password flow before that fix therefore holds
-- CLEARTEXT in password_hash. A bcrypt hash always begins with "$2a$", "$2b$",
-- or "$2y$" (argon2 with "$argon2"); anything else in this column is a pre-fix
-- plaintext value. The cleartext cannot be recovered or safely re-hashed, so we
-- LOCK those accounts and force a password reset.
--
-- Numbered 130: this branch already uses 124–129, and 123 is reserved for the
-- sibling security/audit-fixes-2026-05-30 RLS migration (see reconciliation note
-- in docs/audits/rawdrive-v0.0.65-full-audit-2026-05-30.md §0).
--
-- Idempotent: already-locked rows carry the sentinel (itself non-bcrypt), so a
-- re-run only re-applies the same sentinel — a practical no-op.

-- 1) Revoke any live refresh sessions for affected users FIRST — before the hash
--    is overwritten, while the predicate still matches. This stops a stolen or
--    still-active session from minting fresh access tokens after the lock.
--    refresh_sessions.sub is TEXT (migration 062); users.id is UUID → cast.
UPDATE refresh_sessions
SET revoked = TRUE, family_revoked = TRUE
WHERE sub IN (
    SELECT id::text FROM users
    WHERE password_hash IS NOT NULL
      AND password_hash <> ''
      AND password_hash NOT LIKE '$2a$%'
      AND password_hash NOT LIKE '$2b$%'
      AND password_hash NOT LIKE '$2y$%'
      AND password_hash NOT LIKE '$argon2%'
);

-- 2) Overwrite the cleartext with a sentinel that can never satisfy
--    bcrypt.CompareHashAndPassword (password login fails closed), and flag the
--    account so the app forces a password change / reset on next contact.
UPDATE users
SET password_hash = '!F001-LOCKED-REQUIRES-RESET',
    must_change_password = TRUE,
    updated_at = now()
WHERE password_hash IS NOT NULL
  AND password_hash <> ''
  AND password_hash NOT LIKE '$2a$%'
  AND password_hash NOT LIKE '$2b$%'
  AND password_hash NOT LIKE '$2y$%'
  AND password_hash NOT LIKE '$argon2%';
