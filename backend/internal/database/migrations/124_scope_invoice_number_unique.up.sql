-- F-002: invoices.invoice_number UNIQUE constraint must be workspace-scoped.
--
-- Migration 022 created `CONSTRAINT invoices_number_unique UNIQUE (invoice_number)`,
-- a GLOBAL constraint across every workspace. But invoice numbers are generated
-- per-workspace as INV-{FY}-{SEQ:06d}, where SEQ = COUNT(*) of that workspace's
-- invoices in the financial year (see invoice_repo.go). Two different workspaces
-- both creating their first invoice in the same FY independently compute SEQ=1 and
-- both produce INV-2024-25-000001 — the second INSERT fails with a raw DB
-- unique-violation surfaced verbatim to the user.
--
-- This mirrors migration 088 (streaming_invoices_number_unique), which already uses
-- the correct UNIQUE (workspace_id, invoice_number) for the identical numbering scheme.
--
-- Repo rule: committed migration 022 is never edited; this is an append-only follow-up.

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_number_unique;

-- Workspace-scoped uniqueness: the same invoice_number may now exist in two
-- different workspaces, but never twice within one workspace.
ALTER TABLE invoices
    ADD CONSTRAINT invoices_workspace_number_unique
    UNIQUE (workspace_id, invoice_number);
