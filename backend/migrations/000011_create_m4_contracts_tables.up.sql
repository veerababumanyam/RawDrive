-- M4: Contracts & E-Signatures — contract_templates, contracts

CREATE TABLE contract_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'custom',
    content_html TEXT NOT NULL DEFAULT '',
    variables JSONB NOT NULL DEFAULT '[]',
    is_preset BOOLEAN NOT NULL DEFAULT false,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT contract_templates_category_check CHECK (category IN ('wedding', 'event', 'commercial', 'portrait', 'custom'))
);

CREATE INDEX idx_contract_templates_workspace_id ON contract_templates(workspace_id);

ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY contract_templates_workspace_isolation ON contract_templates
    USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id),
    template_id UUID REFERENCES contract_templates(id),
    title TEXT NOT NULL,
    content_html TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    total_value_paisa BIGINT,
    signed_at TIMESTAMPTZ,
    signer_ip INET,
    signer_user_agent TEXT,
    signature_data TEXT,
    expires_at TIMESTAMPTZ,
    event_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT contracts_status_check CHECK (status IN ('draft', 'sent', 'viewed', 'signed', 'expired', 'cancelled'))
);

CREATE INDEX idx_contracts_workspace_id ON contracts(workspace_id);
CREATE INDEX idx_contracts_contact_id ON contracts(contact_id);
CREATE INDEX idx_contracts_workspace_status ON contracts(workspace_id, status);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contracts_workspace_isolation ON contracts
    USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid);
