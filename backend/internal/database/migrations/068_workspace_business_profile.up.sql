-- Migration 068: workspace business profile fields for invoice branding
--
-- Adds studio address, contact, and bank columns to the workspaces table so
-- the invoice PDF renderer can produce a professional tax invoice without a
-- separate workspace_branding table. All fields are nullable — existing
-- workspaces continue to work, and the PDF renderer falls back to workspace
-- name + GSTIN when branding is incomplete.
--
-- logo_url is stored as a TEXT path into the R2 bucket (same convention as
-- asset.storage_key); the actual logo image embedding in the PDF remains a
-- Phase 2 item. This migration only opens the data surface so the Business
-- Profile settings page can start capturing data today.

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS address_line1  TEXT,
    ADD COLUMN IF NOT EXISTS address_line2  TEXT,
    ADD COLUMN IF NOT EXISTS city           TEXT,
    ADD COLUMN IF NOT EXISTS postal_code    TEXT,
    ADD COLUMN IF NOT EXISTS phone          TEXT,
    ADD COLUMN IF NOT EXISTS email          TEXT,
    ADD COLUMN IF NOT EXISTS website        TEXT,
    ADD COLUMN IF NOT EXISTS logo_url       TEXT,
    ADD COLUMN IF NOT EXISTS bank_name      TEXT,
    ADD COLUMN IF NOT EXISTS bank_account_holder TEXT,
    ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
    ADD COLUMN IF NOT EXISTS bank_ifsc      TEXT,
    ADD COLUMN IF NOT EXISTS bank_branch    TEXT,
    ADD COLUMN IF NOT EXISTS signature_name TEXT,
    ADD COLUMN IF NOT EXISTS invoice_terms  TEXT,
    ADD COLUMN IF NOT EXISTS invoice_footer TEXT;
