-- Down migration for F-005 platform settings encryption. Dropping these
-- columns removes all at-rest encrypted values — if any rows have been
-- written through the new path, the plaintext `value` column will be NULL
-- for those rows and they will become unreadable. This down migration is
-- only safe on a DB that has never had the new repo writes applied.

ALTER TABLE platform_settings
    DROP COLUMN IF EXISTS encrypted_value,
    DROP COLUMN IF EXISTS dek_wrapped;
