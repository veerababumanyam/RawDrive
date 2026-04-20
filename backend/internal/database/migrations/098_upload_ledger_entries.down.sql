-- M40 / Upload Credit Meter — 098 down
-- Index drops must precede table drop because the indexes reference the table.
DROP INDEX IF EXISTS idx_upload_ledger_workspace_idem_key;
DROP INDEX IF EXISTS idx_upload_ledger_reservation_ref;
DROP INDEX IF EXISTS idx_upload_ledger_workspace_created;
DROP TABLE IF EXISTS upload_ledger_entries;
