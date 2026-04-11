-- Rollback migration 068
ALTER TABLE workspaces
    DROP COLUMN IF EXISTS invoice_footer,
    DROP COLUMN IF EXISTS invoice_terms,
    DROP COLUMN IF EXISTS signature_name,
    DROP COLUMN IF EXISTS bank_branch,
    DROP COLUMN IF EXISTS bank_ifsc,
    DROP COLUMN IF EXISTS bank_account_number,
    DROP COLUMN IF EXISTS bank_account_holder,
    DROP COLUMN IF EXISTS bank_name,
    DROP COLUMN IF EXISTS logo_url,
    DROP COLUMN IF EXISTS website,
    DROP COLUMN IF EXISTS email,
    DROP COLUMN IF EXISTS phone,
    DROP COLUMN IF EXISTS postal_code,
    DROP COLUMN IF EXISTS city,
    DROP COLUMN IF EXISTS address_line2,
    DROP COLUMN IF EXISTS address_line1;
