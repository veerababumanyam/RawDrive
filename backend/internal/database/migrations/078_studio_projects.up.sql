-- M26: Studio Project aggregate and workflow linking.

CREATE TABLE IF NOT EXISTS studio_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id),
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    source_deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
    package_id UUID REFERENCES service_packages(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    project_type TEXT NOT NULL DEFAULT 'other',
    status TEXT NOT NULL DEFAULT 'inquiry',
    event_date DATE,
    event_end_date DATE,
    venue_name TEXT,
    venue_address TEXT,
    city TEXT,
    state_code TEXT,
    expected_value_paisa BIGINT NOT NULL DEFAULT 0,
    booked_value_paisa BIGINT NOT NULL DEFAULT 0,
    balance_due_paisa BIGINT NOT NULL DEFAULT 0,
    contract_status TEXT NOT NULL DEFAULT 'not_started',
    gallery_status TEXT NOT NULL DEFAULT 'not_started',
    next_action TEXT,
    next_action_due_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ,
    CONSTRAINT studio_projects_status_check CHECK (status IN (
        'inquiry', 'quoted', 'reserved', 'booked', 'shooting',
        'editing', 'proofing', 'delivered', 'archived', 'cancelled', 'lost'
    )),
    CONSTRAINT studio_projects_contract_status_check CHECK (contract_status IN (
        'not_started', 'draft', 'sent', 'signed', 'expired', 'cancelled'
    )),
    CONSTRAINT studio_projects_gallery_status_check CHECK (gallery_status IN (
        'not_started', 'draft', 'shared', 'proofing', 'delivered', 'archived'
    ))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_projects_source_deal_id
    ON studio_projects(source_deal_id)
    WHERE source_deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_studio_projects_workspace_status_event
    ON studio_projects(workspace_id, status, event_date);
CREATE INDEX IF NOT EXISTS idx_studio_projects_workspace_contact_updated
    ON studio_projects(workspace_id, contact_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_projects_workspace_next_action
    ON studio_projects(workspace_id, next_action_due_at)
    WHERE next_action_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_studio_projects_workspace_type_event
    ON studio_projects(workspace_id, project_type, event_date);

ALTER TABLE studio_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS studio_projects_workspace_isolation ON studio_projects;
CREATE POLICY studio_projects_workspace_isolation ON studio_projects
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

-- Idempotent deal -> project backfill. Existing deals remain in place for
-- compatibility while new project-facing reads use studio_projects.
INSERT INTO studio_projects (
    workspace_id,
    contact_id,
    source_deal_id,
    name,
    project_type,
    status,
    event_date,
    venue_name,
    expected_value_paisa,
    booked_value_paisa,
    balance_due_paisa,
    next_action,
    notes,
    created_at,
    updated_at
)
SELECT
    d.workspace_id,
    d.contact_id,
    d.id,
    d.title,
    COALESCE(NULLIF(d.event_type, ''), 'other'),
    CASE d.stage
        WHEN 'proposal' THEN 'quoted'
        WHEN 'negotiation' THEN 'reserved'
        WHEN 'confirmed' THEN 'booked'
        WHEN 'in_progress' THEN 'editing'
        WHEN 'completed' THEN 'delivered'
        WHEN 'cancelled' THEN 'cancelled'
        ELSE 'inquiry'
    END,
    d.event_date,
    d.venue,
    d.amount_paisa,
    CASE
        WHEN d.stage IN ('confirmed', 'in_progress', 'completed') THEN d.amount_paisa
        ELSE 0
    END,
    GREATEST(d.amount_paisa - COALESCE(d.advance_paisa, 0), 0),
    CASE
        WHEN d.stage = 'proposal' THEN 'Send quote follow-up'
        WHEN d.stage = 'negotiation' THEN 'Confirm booking and advance'
        WHEN d.stage = 'confirmed' THEN 'Schedule shoot'
        WHEN d.stage = 'in_progress' THEN 'Track editing and delivery'
        ELSE NULL
    END,
    d.notes,
    d.created_at,
    d.updated_at
FROM deals d
WHERE NOT EXISTS (
    SELECT 1
    FROM studio_projects sp
    WHERE sp.source_deal_id = d.id
);

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES studio_projects(id) ON DELETE SET NULL;
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES studio_projects(id) ON DELETE SET NULL;
ALTER TABLE contracts
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES studio_projects(id) ON DELETE SET NULL;
ALTER TABLE galleries
    ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES studio_projects(id) ON DELETE SET NULL;
ALTER TABLE follow_ups
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES studio_projects(id) ON DELETE SET NULL;
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES studio_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_project_id ON events(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_contracts_project_id ON contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_galleries_contact_id ON galleries(contact_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_galleries_project_id ON galleries(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_follow_ups_project_id ON follow_ups(project_id);
CREATE INDEX IF NOT EXISTS idx_payments_project_id ON payments(project_id);

-- Backfill direct links from legacy deal references where they exist.
UPDATE events e
SET project_id = sp.id
FROM studio_projects sp
WHERE e.project_id IS NULL
  AND e.deal_id IS NOT NULL
  AND e.deal_id = sp.source_deal_id
  AND e.workspace_id = sp.workspace_id;

UPDATE follow_ups f
SET project_id = sp.id
FROM studio_projects sp
WHERE f.project_id IS NULL
  AND f.deal_id IS NOT NULL
  AND f.deal_id = sp.source_deal_id
  AND f.workspace_id = sp.workspace_id;

UPDATE payments p
SET project_id = i.project_id
FROM invoices i
WHERE p.project_id IS NULL
  AND i.project_id IS NOT NULL
  AND p.invoice_id = i.id
  AND p.workspace_id = i.workspace_id;
