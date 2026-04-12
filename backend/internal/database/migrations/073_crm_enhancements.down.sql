-- Revert migration 073: CRM enhancements

ALTER TABLE leads DROP COLUMN IF EXISTS follow_up_date;

-- Restore original leads source constraint
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check
    CHECK (source IN ('website', 'referral', 'whatsapp', 'walk_in', 'social_media', 'marketplace'));

ALTER TABLE contacts
    DROP COLUMN IF EXISTS whatsapp_number,
    DROP COLUMN IF EXISTS gstin,
    DROP COLUMN IF EXISTS pan,
    DROP COLUMN IF EXISTS birthday,
    DROP COLUMN IF EXISTS anniversary,
    DROP COLUMN IF EXISTS referral_source,
    DROP COLUMN IF EXISTS client_source;

-- Restore original invoice_type constraint
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_type_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_type_check
    CHECK (invoice_type IN ('subscription', 'addon', 'service', 'credit_note'));

ALTER TABLE invoices
    DROP COLUMN IF EXISTS place_of_supply_state,
    DROP COLUMN IF EXISTS place_of_supply_code,
    DROP COLUMN IF EXISTS amount_in_words,
    DROP COLUMN IF EXISTS round_off_paisa;

ALTER TABLE workspaces
    DROP COLUMN IF EXISTS upi_id,
    DROP COLUMN IF EXISTS pan_number,
    DROP COLUMN IF EXISTS instagram_handle,
    DROP COLUMN IF EXISTS state_code;
