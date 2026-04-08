-- M4: Billing Tables — invoices, payments

CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    state_id INT NOT NULL REFERENCES states(id),
    contact_id UUID REFERENCES contacts(id),
    invoice_number TEXT NOT NULL,
    invoice_type TEXT NOT NULL DEFAULT 'service',
    status TEXT NOT NULL DEFAULT 'draft',
    currency TEXT NOT NULL DEFAULT 'INR',
    subtotal_paisa BIGINT NOT NULL DEFAULT 0,
    cgst_paisa BIGINT NOT NULL DEFAULT 0,
    sgst_paisa BIGINT NOT NULL DEFAULT 0,
    igst_paisa BIGINT NOT NULL DEFAULT 0,
    total_paisa BIGINT NOT NULL DEFAULT 0,
    amount_paid_paisa BIGINT NOT NULL DEFAULT 0,
    discount_paisa BIGINT NOT NULL DEFAULT 0,
    line_items JSONB NOT NULL DEFAULT '[]',
    due_date DATE,
    paid_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT invoices_number_unique UNIQUE (invoice_number),
    CONSTRAINT invoices_type_check CHECK (invoice_type IN ('subscription', 'addon', 'service', 'credit_note')),
    CONSTRAINT invoices_status_check CHECK (status IN ('draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled', 'refunded'))
);

CREATE INDEX idx_invoices_workspace_id ON invoices(workspace_id);
CREATE INDEX idx_invoices_workspace_status ON invoices(workspace_id, status);
CREATE INDEX idx_invoices_contact_id ON invoices(contact_id);
CREATE INDEX idx_invoices_state_id ON invoices(state_id);
CREATE INDEX idx_invoices_paid_at ON invoices(paid_at) WHERE paid_at IS NOT NULL;

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoices_workspace_isolation ON invoices
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES invoices(id),
    amount_paisa BIGINT NOT NULL,
    method TEXT NOT NULL DEFAULT 'cash',
    reference_number TEXT,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payments_method_check CHECK (method IN ('cash', 'upi', 'bank_transfer', 'card', 'cheque', 'razorpay'))
);

CREATE INDEX idx_payments_workspace_id ON payments(workspace_id);
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_workspace_isolation ON payments
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );
