-- Rollback only — data NOT restored. The dropped column held plaintext PINs
-- which were deliberately retired; reintroducing the column is schema-only.

ALTER TABLE streams ADD COLUMN pin_code TEXT;
COMMENT ON COLUMN streams.pin_code IS 'DEPRECATED reintroduction for rollback only — no data restore';
