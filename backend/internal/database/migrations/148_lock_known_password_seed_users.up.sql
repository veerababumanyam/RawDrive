-- 148 — lock production-unsafe known-password seed accounts.
--
-- Historical migrations created loginable credentials in the production
-- migration stream:
--   - 006 assigned TestPassword123! to any pre-existing passwordless user.
--   - 036 seeded @rawdrive.test RBAC users with known passwords.
--
-- Do not delete these rows here: a production database may already have
-- accidental data hanging off those users/workspaces. Instead, revoke refresh
-- sessions, replace the password hash with a non-bcrypt sentinel, force reset,
-- and demote the explicit migration-036 identities.

BEGIN;

CREATE TEMP TABLE f148_locked_users (
    id UUID PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO f148_locked_users (id)
SELECT id
FROM users
WHERE password_hash IS NOT NULL
  AND password_hash <> ''
  AND (
      password_hash LIKE '$2a$%'
      OR password_hash LIKE '$2b$%'
      OR password_hash LIKE '$2y$%'
  )
  AND (
      password_hash = crypt('TestPassword123!', password_hash)
      OR (email = 'superadmin@rawdrive.test' AND password_hash = crypt('SuperAdmin123!', password_hash))
      OR (email = 'admin@rawdrive.test'      AND password_hash = crypt('Admin123!', password_hash))
      OR (email = 'dealer@rawdrive.test'     AND password_hash = crypt('Dealer123!', password_hash))
  )
ON CONFLICT DO NOTHING;

UPDATE refresh_sessions
SET revoked = TRUE,
    family_revoked = TRUE
WHERE sub IN (SELECT id::text FROM f148_locked_users);

UPDATE users
SET password_hash = '!F148-LOCKED-KNOWN-PROD-SEED',
    must_change_password = TRUE,
    email_verified = CASE
        WHEN email IN ('superadmin@rawdrive.test', 'admin@rawdrive.test', 'dealer@rawdrive.test') THEN FALSE
        ELSE email_verified
    END,
    platform_role = CASE
        WHEN email IN ('superadmin@rawdrive.test', 'admin@rawdrive.test', 'dealer@rawdrive.test') THEN 'photographer'
        ELSE platform_role
    END,
    updated_at = now()
WHERE id IN (SELECT id FROM f148_locked_users);

COMMIT;
