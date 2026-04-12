-- Migration 077: M24 service packages and invoice document metadata

CREATE TABLE IF NOT EXISTS service_packages (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    inclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
    base_price_paisa BIGINT NOT NULL CHECK (base_price_paisa >= 0),
    gst_rate NUMERIC(5,2) NOT NULL DEFAULT 18.00,
    sac_code TEXT NOT NULL DEFAULT '998386',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_packages_workspace_active
    ON service_packages(workspace_id, active);

CREATE TABLE IF NOT EXISTS package_addons (
    id UUID PRIMARY KEY,
    package_id UUID NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_paisa BIGINT NOT NULL CHECK (price_paisa >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_package_addons_package_id
    ON package_addons(package_id);

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS quotation_valid_until DATE,
    ADD COLUMN IF NOT EXISTS credit_note_invoice_id UUID REFERENCES invoices(id),
    ADD COLUMN IF NOT EXISTS credit_note_reason TEXT,
    ADD COLUMN IF NOT EXISTS source_package_id UUID REFERENCES service_packages(id);
