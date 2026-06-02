-- Down for migration 148.
--
-- Intentionally irreversible: the up migration destroys known/default
-- credentials and revokes sessions. A rollback must not restore production-
-- unsafe passwords or re-elevate test identities.
DO $$
BEGIN
    -- no-op by design
END $$;
