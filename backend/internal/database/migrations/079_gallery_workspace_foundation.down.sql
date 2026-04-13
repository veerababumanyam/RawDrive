DROP INDEX IF EXISTS idx_galleries_workspace_publication;
DROP INDEX IF EXISTS idx_galleries_workspace_invoice;
DROP INDEX IF EXISTS idx_galleries_workspace_deal;
DROP INDEX IF EXISTS idx_galleries_workspace_event;
DROP INDEX IF EXISTS idx_galleries_workspace_primary_contact;

ALTER TABLE galleries
    DROP COLUMN IF EXISTS archived_at,
    DROP COLUMN IF EXISTS published_at,
    DROP COLUMN IF EXISTS invoice_id,
    DROP COLUMN IF EXISTS deal_id,
    DROP COLUMN IF EXISTS event_id,
    DROP COLUMN IF EXISTS primary_contact_id;
