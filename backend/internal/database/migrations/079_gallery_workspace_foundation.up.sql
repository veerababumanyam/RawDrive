-- M27: Gallery Workspace Foundation and Link Hygiene.
-- Adds explicit CRM relationship columns so galleries can act as the
-- photographer's workspace for client delivery, not as an isolated module.

ALTER TABLE galleries
    ADD COLUMN IF NOT EXISTS primary_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

UPDATE galleries
SET primary_contact_id = contact_id
WHERE primary_contact_id IS NULL
  AND contact_id IS NOT NULL;

UPDATE galleries
SET published_at = COALESCE(updated_at, created_at, now())
WHERE published_at IS NULL
  AND (is_published = true OR status IN ('shared', 'protected', 'published'));

UPDATE galleries
SET archived_at = COALESCE(updated_at, created_at, now())
WHERE archived_at IS NULL
  AND status = 'archived';

CREATE INDEX IF NOT EXISTS idx_galleries_workspace_primary_contact
    ON galleries(workspace_id, primary_contact_id)
    WHERE deleted_at IS NULL AND primary_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_galleries_workspace_event
    ON galleries(workspace_id, event_id)
    WHERE deleted_at IS NULL AND event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_galleries_workspace_deal
    ON galleries(workspace_id, deal_id)
    WHERE deleted_at IS NULL AND deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_galleries_workspace_invoice
    ON galleries(workspace_id, invoice_id)
    WHERE deleted_at IS NULL AND invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_galleries_workspace_publication
    ON galleries(workspace_id, status, published_at)
    WHERE deleted_at IS NULL;
