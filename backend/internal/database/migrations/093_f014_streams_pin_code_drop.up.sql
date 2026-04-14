-- M35 / F-014: drop legacy plaintext streams.pin_code column (E110-S2 / 35-9).
-- argon2id pin_hash (migration 082) is the runtime source of truth and has
-- been backfilled by cmd/backfill-pin-hash. Dropping the plaintext column
-- narrows the sensitive-data surface. IF EXISTS makes this idempotent on
-- fresh databases where pin_code may never have been present.

ALTER TABLE streams DROP COLUMN IF EXISTS pin_code;
