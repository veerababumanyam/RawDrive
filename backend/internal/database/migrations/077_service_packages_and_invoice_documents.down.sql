-- Revert migration 077: M24 service packages and invoice document metadata

ALTER TABLE invoices
    DROP COLUMN IF EXISTS source_package_id,
    DROP COLUMN IF EXISTS credit_note_reason,
    DROP COLUMN IF EXISTS credit_note_invoice_id,
    DROP COLUMN IF EXISTS quotation_valid_until;

DROP TABLE IF EXISTS package_addons;
DROP TABLE IF EXISTS service_packages;
