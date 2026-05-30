-- 130 (down) — IRREVERSIBLE by design.
--
-- The up migration destroyed pre-fix plaintext password_hash values (overwrote
-- them with a lock sentinel) and revoked the affected refresh sessions. There is
-- no safe way to restore cleartext credentials, and the must_change_password
-- flag is also set by other flows, so it must not be blanket-cleared here.
--
-- This down is a deliberate no-op so the migration can be rolled back in the
-- runner's bookkeeping without resurrecting the F-001 plaintext exposure.
SELECT 1;
