-- M4: CRM Tables — leads, contacts, deals, follow_ups

CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    source TEXT DEFAULT 'website',
    stage TEXT NOT NULL DEFAULT 'new',
    event_type TEXT,
    event_date DATE,
    budget_paisa BIGINT,
    assigned_to UUID REFERENCES users(id),
    notes TEXT,
    converted_contact_id UUID,
    lost_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT leads_stage_check CHECK (stage IN ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
    CONSTRAINT leads_source_check CHECK (source IN ('website', 'referral', 'whatsapp', 'walk_in', 'social_media', 'marketplace'))
);

CREATE INDEX idx_leads_workspace_id ON leads(workspace_id);
CREATE INDEX idx_leads_workspace_stage ON leads(workspace_id, stage);
CREATE INDEX idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX idx_leads_event_date ON leads(workspace_id, event_date);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY leads_workspace_isolation ON leads
    USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    contact_type TEXT NOT NULL DEFAULT 'client',
    company TEXT,
    address JSONB,
    tags TEXT[] DEFAULT '{}',
    notes TEXT,
    total_revenue_paisa BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT contacts_type_check CHECK (contact_type IN ('client', 'vendor', 'collaborator'))
);

CREATE INDEX idx_contacts_workspace_id ON contacts(workspace_id);
CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_contacts_workspace_email ON contacts(workspace_id, email);
CREATE INDEX idx_contacts_tags_gin ON contacts USING GIN (tags);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contacts_workspace_isolation ON contacts
    USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

-- Add FK from leads.converted_contact_id now that contacts table exists
ALTER TABLE leads ADD CONSTRAINT leads_converted_contact_fk
    FOREIGN KEY (converted_contact_id) REFERENCES contacts(id);

CREATE TABLE deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id),
    title TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'proposal',
    amount_paisa BIGINT NOT NULL DEFAULT 0,
    advance_paisa BIGINT DEFAULT 0,
    event_type TEXT,
    event_date DATE,
    venue TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT deals_stage_check CHECK (stage IN ('proposal', 'negotiation', 'confirmed', 'in_progress', 'completed', 'cancelled'))
);

CREATE INDEX idx_deals_workspace_id ON deals(workspace_id);
CREATE INDEX idx_deals_contact_id ON deals(contact_id);
CREATE INDEX idx_deals_workspace_stage ON deals(workspace_id, stage);

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY deals_workspace_isolation ON deals
    USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

CREATE TABLE follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id),
    contact_id UUID REFERENCES contacts(id),
    deal_id UUID REFERENCES deals(id),
    assigned_to UUID REFERENCES users(id),
    type TEXT NOT NULL DEFAULT 'call',
    due_at TIMESTAMPTZ NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT follow_ups_type_check CHECK (type IN ('call', 'whatsapp', 'email', 'meeting', 'task')),
    CONSTRAINT follow_ups_status_check CHECK (status IN ('pending', 'completed', 'overdue', 'cancelled'))
);

CREATE INDEX idx_follow_ups_workspace_id ON follow_ups(workspace_id);
CREATE INDEX idx_follow_ups_due_at ON follow_ups(workspace_id, due_at) WHERE status = 'pending';
CREATE INDEX idx_follow_ups_assigned_to ON follow_ups(assigned_to) WHERE status = 'pending';

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY follow_ups_workspace_isolation ON follow_ups
    USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid);
