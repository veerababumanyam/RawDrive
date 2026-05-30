-- Revert F-002: restore the original GLOBAL unique constraint from migration 022.
--
-- NOTE: this rollback can fail if, while the workspace-scoped constraint was in
-- force, two workspaces stored the same invoice_number (which is exactly the
-- scenario the up-migration enables). That is expected — reverting to a stricter
-- global constraint requires the data to satisfy it.

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_workspace_number_unique;

ALTER TABLE invoices
    ADD CONSTRAINT invoices_number_unique
    UNIQUE (invoice_number);
