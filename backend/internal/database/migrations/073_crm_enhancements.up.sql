-- Migration 073: CRM enhancements — business profile, invoice, contacts, leads
--
-- Adds UPI/PAN/Instagram to workspace business profile, Place of Supply and
-- amount-in-words to invoices, and 360-degree client profile fields to contacts.
-- Also expands lead source enum for India-specific channels.

-- === WORKSPACE BUSINESS PROFILE ENHANCEMENTS ===
ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS upi_id             TEXT,
    ADD COLUMN IF NOT EXISTS pan_number          TEXT,
    ADD COLUMN IF NOT EXISTS instagram_handle    TEXT,
    ADD COLUMN IF NOT EXISTS state_code          TEXT;  -- 2-digit GSTIN state code (e.g., "36" for Telangana)

-- === INVOICE ENHANCEMENTS ===
-- Place of Supply is critical for CGST/SGST vs IGST determination.
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS place_of_supply_state TEXT,
    ADD COLUMN IF NOT EXISTS place_of_supply_code  TEXT,
    ADD COLUMN IF NOT EXISTS amount_in_words       TEXT,
    ADD COLUMN IF NOT EXISTS round_off_paisa       BIGINT NOT NULL DEFAULT 0;

-- Expand invoice_type to include proforma and quotation.
-- The old CHECK constraint only allows subscription/addon/service/credit_note.
-- We need proforma and quotation as first-class document types.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_type_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_type_check
    CHECK (invoice_type IN ('subscription', 'addon', 'service', 'credit_note', 'proforma', 'quotation'));

-- === CONTACT (CLIENT) PROFILE ENHANCEMENTS ===
ALTER TABLE contacts
    ADD COLUMN IF NOT EXISTS whatsapp_number  TEXT,
    ADD COLUMN IF NOT EXISTS gstin            TEXT,
    ADD COLUMN IF NOT EXISTS pan              TEXT,
    ADD COLUMN IF NOT EXISTS birthday         DATE,
    ADD COLUMN IF NOT EXISTS anniversary      DATE,
    ADD COLUMN IF NOT EXISTS referral_source  TEXT,
    ADD COLUMN IF NOT EXISTS client_source    TEXT;

-- Expand the source check constraint on leads to include India-specific channels.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check
    CHECK (source IN (
        'website', 'referral', 'whatsapp', 'walk_in', 'social_media',
        'marketplace', 'instagram', 'justdial', 'google', 'wedding_platform',
        'facebook', 'other'
    ));

-- Add follow_up_date to leads for reminder tracking.
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS follow_up_date DATE;
