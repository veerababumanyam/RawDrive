-- 177_pricing_governance_and_products.up.sql
-- Governed pricing/catalog foundation: approval workflow, product catalog,
-- immutable order snapshots, storage boosters, and email batch audit.

BEGIN;

CREATE TABLE IF NOT EXISTS pricing_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type TEXT NOT NULL
        CHECK (request_type IN (
            'plan_create',
            'plan_update',
            'plan_archive',
            'plan_reorder',
            'product_create',
            'product_update',
            'product_archive',
            'product_reorder'
        )),
    target_type TEXT NOT NULL
        CHECK (target_type IN ('subscription_plan', 'billing_product', 'catalog')),
    target_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN (
            'draft',
            'pending_approval',
            'approved',
            'rejected',
            'scheduled',
            'published',
            'cancelled'
        )),
    submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    approval_comment TEXT,
    effective_from TIMESTAMPTZ,
    before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    impact_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    email_preview JSONB NOT NULL DEFAULT '{}'::jsonb,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pricing_change_requests_rejection_reason_required
        CHECK (status <> 'rejected' OR NULLIF(BTRIM(COALESCE(rejection_reason, '')), '') IS NOT NULL),
    CONSTRAINT pricing_change_requests_approval_comment_required
        CHECK (status NOT IN ('approved', 'scheduled', 'published')
               OR NULLIF(BTRIM(COALESCE(approval_comment, '')), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_pricing_change_requests_status_created
    ON pricing_change_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pricing_change_requests_target
    ON pricing_change_requests(target_type, target_key, created_at DESC);

CREATE TABLE IF NOT EXISTS pricing_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    change_request_id UUID REFERENCES pricing_change_requests(id) ON DELETE SET NULL,
    target_type TEXT NOT NULL,
    target_key TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    comment TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_audit_events_target_created
    ON pricing_audit_events(target_type, target_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pricing_audit_events_change_request_created
    ON pricing_audit_events(change_request_id, created_at DESC)
    WHERE change_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_products (
    code TEXT PRIMARY KEY,
    product_type TEXT NOT NULL
        CHECK (product_type IN (
            'event_upload',
            'gallery_extension',
            'storage_booster',
            'upload_credit_pack',
            'streaming_pack'
        )),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    rank INTEGER NOT NULL DEFAULT 0,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_products_type_active_rank
    ON billing_products(product_type, active, rank);

CREATE TABLE IF NOT EXISTS billing_product_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_code TEXT NOT NULL REFERENCES billing_products(code) ON DELETE RESTRICT,
    version INTEGER NOT NULL CHECK (version > 0),
    status TEXT NOT NULL DEFAULT 'approved'
        CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'scheduled', 'published', 'archived')),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'INR',
    price_paise BIGINT NOT NULL CHECK (price_paise >= 0),
    billing_interval TEXT NOT NULL DEFAULT 'one_time'
        CHECK (billing_interval IN ('one_time', 'monthly', 'annual')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    rank INTEGER NOT NULL DEFAULT 0,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT billing_product_versions_code_version_unique UNIQUE (product_code, version),
    CONSTRAINT billing_product_versions_effective_window
        CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX IF NOT EXISTS idx_billing_product_versions_public
    ON billing_product_versions(status, active, rank, effective_from DESC)
    WHERE status IN ('approved', 'published') AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_billing_product_versions_product_effective
    ON billing_product_versions(product_code, status, effective_from DESC, version DESC);

INSERT INTO billing_products (code, product_type, name, description, active, rank)
VALUES
    ('event_upload_standard', 'event_upload', 'Event upload', 'One-off event upload cycle for occasional shoots.', TRUE, 10),
    ('event_upload_wedding', 'event_upload', 'Wedding upload', 'Longer one-off upload cycle for weddings and multi-day events.', TRUE, 20),
    ('gallery_extend_30', 'gallery_extension', 'Extend +30 days', 'Keep a gallery active for another 30 days.', TRUE, 30),
    ('gallery_extend_90', 'gallery_extension', 'Extend +90 days', 'Keep a gallery active for another 90 days.', TRUE, 40),
    ('gallery_archive_forever', 'gallery_extension', 'Download + archive forever', 'Export the gallery package and keep the event archived.', TRUE, 50),
    ('storage_boost_50', 'storage_booster', 'Boost 50', 'Add 50GB recurring storage.', TRUE, 60),
    ('storage_boost_250', 'storage_booster', 'Boost 250', 'Add 250GB recurring storage.', TRUE, 70),
    ('storage_boost_1000', 'storage_booster', 'Boost 1000', 'Add 1TB recurring storage.', TRUE, 80)
ON CONFLICT (code) DO NOTHING;

INSERT INTO billing_product_versions (
    product_code, version, status, name, description, currency, price_paise,
    billing_interval, metadata, active, rank, effective_from, approved_at
)
VALUES
    (
        'event_upload_standard', 1, 'approved', 'Event upload',
        'Best for occasional shoots and beginners who do not want a subscription.',
        'INR', 19900, 'one_time',
        '{"active_days":30,"retention_days":90,"upload_window_days":30,"upload_credits":500}'::jsonb,
        TRUE, 10, NOW(), NOW()
    ),
    (
        'event_upload_wedding', 1, 'approved', 'Wedding upload',
        'Built for multi-day weddings, larger delivery sets, and longer client selection cycles.',
        'INR', 49900, 'one_time',
        '{"active_days":60,"retention_days":90,"upload_window_days":60,"upload_credits":2000}'::jsonb,
        TRUE, 20, NOW(), NOW()
    ),
    (
        'gallery_extend_30', 1, 'approved', 'Extend +30 days',
        'Keep a gallery live for another month.',
        'INR', 4900, 'one_time',
        '{"extension_days":30}'::jsonb,
        TRUE, 30, NOW(), NOW()
    ),
    (
        'gallery_extend_90', 1, 'approved', 'Extend +90 days',
        'A full extra quarter of client access.',
        'INR', 9900, 'one_time',
        '{"extension_days":90}'::jsonb,
        TRUE, 40, NOW(), NOW()
    ),
    (
        'gallery_archive_forever', 1, 'approved', 'Download + archive forever',
        'Export the gallery package and keep the event archived.',
        'INR', 19900, 'one_time',
        '{"archive_forever":true}'::jsonb,
        TRUE, 50, NOW(), NOW()
    ),
    (
        'storage_boost_50', 1, 'approved', 'Boost 50',
        'Add 50GB recurring storage.',
        'INR', 30000, 'monthly',
        '{"quota_bytes":53687091200}'::jsonb,
        TRUE, 60, NOW(), NOW()
    ),
    (
        'storage_boost_250', 1, 'approved', 'Boost 250',
        'Add 250GB recurring storage.',
        'INR', 100000, 'monthly',
        '{"quota_bytes":268435456000}'::jsonb,
        TRUE, 70, NOW(), NOW()
    ),
    (
        'storage_boost_1000', 1, 'approved', 'Boost 1000',
        'Add 1TB recurring storage.',
        'INR', 350000, 'monthly',
        '{"quota_bytes":1099511627776}'::jsonb,
        TRUE, 80, NOW(), NOW()
    )
ON CONFLICT (product_code, version) DO NOTHING;

CREATE TABLE IF NOT EXISTS billing_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    order_type TEXT NOT NULL
        CHECK (order_type IN (
            'subscription_upgrade',
            'subscription_renewal',
            'scheduled_downgrade',
            'storage_booster',
            'gallery_extension',
            'event_upload'
        )),
    target_type TEXT NOT NULL DEFAULT 'workspace'
        CHECK (target_type IN ('workspace', 'gallery', 'subscription')),
    target_id UUID,
    amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    provider TEXT NOT NULL DEFAULT 'phonepe'
        CHECK (provider IN ('phonepe', 'razorpay', 'manual')),
    provider_order_id TEXT,
    provider_payment_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refunded', 'cancelled')),
    idempotency_key TEXT,
    catalog_snapshot JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_orders_idempotency
    ON billing_orders(workspace_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_orders_provider_order
    ON billing_orders(provider, provider_order_id)
    WHERE provider_order_id IS NOT NULL AND provider_order_id <> '';

CREATE INDEX IF NOT EXISTS idx_billing_orders_workspace_status
    ON billing_orders(workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_storage_boosters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    billing_product_version_id UUID NOT NULL REFERENCES billing_product_versions(id) ON DELETE RESTRICT,
    source_order_id UUID REFERENCES billing_orders(id) ON DELETE SET NULL,
    quota_bytes BIGINT NOT NULL CHECK (quota_bytes > 0),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'cancelled', 'expired')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_storage_boosters_active
    ON workspace_storage_boosters(workspace_id, status, started_at DESC);

CREATE TABLE IF NOT EXISTS pricing_email_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pricing_change_request_id UUID REFERENCES pricing_change_requests(id) ON DELETE SET NULL,
    template_key TEXT NOT NULL,
    template_version TEXT NOT NULL,
    recipient_count INTEGER NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'cancelled')),
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_pricing_email_batches_change_request
    ON pricing_email_batches(pricing_change_request_id, queued_at DESC);

CREATE TABLE IF NOT EXISTS billing_lifecycle_policies (
    code TEXT PRIMARY KEY,
    scope_type TEXT NOT NULL
        CHECK (scope_type IN ('subscription', 'pay_per_event', 'gallery_extension', 'storage_booster')),
    scope_key TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    renewal_reminder_days INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    expiry_warning_days INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    deletion_warning_days INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    gallery_expiry_action TEXT NOT NULL DEFAULT 'hold'
        CHECK (gallery_expiry_action IN ('hold', 'hide', 'delete')),
    gallery_delete_grace_days INTEGER NOT NULL DEFAULT 0 CHECK (gallery_delete_grace_days >= 0),
    account_delete_grace_days INTEGER NOT NULL DEFAULT 0 CHECK (account_delete_grace_days >= 0),
    max_delete_grace_days INTEGER NOT NULL DEFAULT 0 CHECK (max_delete_grace_days >= 0),
    conversion_prompt_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT billing_lifecycle_policies_grace_cap
        CHECK (max_delete_grace_days = 0 OR gallery_delete_grace_days <= max_delete_grace_days)
);

CREATE INDEX IF NOT EXISTS idx_billing_lifecycle_policies_scope
    ON billing_lifecycle_policies(scope_type, scope_key)
    WHERE active = TRUE;

INSERT INTO billing_lifecycle_policies (
    code, scope_type, scope_key, name, description, renewal_reminder_days,
    expiry_warning_days, deletion_warning_days, gallery_expiry_action,
    gallery_delete_grace_days, account_delete_grace_days,
    max_delete_grace_days, conversion_prompt_enabled, metadata
)
VALUES
    (
        'subscription_monthly_default', 'subscription', 'monthly',
        'Monthly subscription lifecycle',
        'Monthly subscription renewals delete galleries immediately on non-renewal and keep account recovery inside the configured grace window.',
        ARRAY[14, 7, 1]::INTEGER[],
        ARRAY[7, 3, 1]::INTEGER[],
        ARRAY[14, 7, 2]::INTEGER[],
        'delete', 0, 30, 30, FALSE,
        '{"payment_success_email":true,"payment_failed_email":true,"legal_proof_required":true}'::jsonb
    ),
    (
        'subscription_annual_default', 'subscription', 'annual',
        'Annual subscription lifecycle',
        'Annual subscription renewals use longer renewal notice but the same non-renewal deletion and account grace policy.',
        ARRAY[30, 14, 7, 1]::INTEGER[],
        ARRAY[14, 7, 3, 1]::INTEGER[],
        ARRAY[14, 7, 2]::INTEGER[],
        'delete', 0, 30, 30, FALSE,
        '{"payment_success_email":true,"payment_failed_email":true,"legal_proof_required":true}'::jsonb
    ),
    (
        'pay_per_event_default', 'pay_per_event', 'default',
        'Pay per event lifecycle',
        'Pay-per-event galleries must be deleted within one week after expiry unless the user extends or upgrades to a subscription.',
        ARRAY[]::INTEGER[],
        ARRAY[7, 3, 1]::INTEGER[],
        ARRAY[7, 3, 1]::INTEGER[],
        'delete', 7, 7, 7, TRUE,
        '{"upgrade_prompt":true,"extension_prompt":true,"legal_proof_required":true}'::jsonb
    ),
    (
        'storage_booster_default', 'storage_booster', 'monthly',
        'Monthly storage booster lifecycle',
        'Storage boosters add quota for the paid month and safely reduce quota at expiry without deleting existing files.',
        ARRAY[7, 3, 1]::INTEGER[],
        ARRAY[7, 3, 1]::INTEGER[],
        ARRAY[]::INTEGER[],
        'hold', 0, 0, 0, FALSE,
        '{"payment_success_email":true,"safe_reduction":true}'::jsonb
    )
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS billing_lifecycle_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_code TEXT REFERENCES billing_lifecycle_policies(code) ON DELETE SET NULL,
    job_type TEXT NOT NULL
        CHECK (job_type IN (
            'renewal_reminder',
            'payment_success',
            'payment_failed',
            'expiry_warning',
            'deletion_warning',
            'gallery_delete',
            'account_delete',
            'conversion_prompt',
            'storage_booster_expire',
            'pricing_change_notice'
        )),
    target_type TEXT NOT NULL
        CHECK (target_type IN ('workspace', 'gallery', 'subscription', 'billing_order', 'user')),
    target_id UUID NOT NULL,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    due_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    claimed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error TEXT,
    proof_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_lifecycle_jobs_due_claim
    ON billing_lifecycle_jobs(status, due_at, id)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_billing_lifecycle_jobs_target
    ON billing_lifecycle_jobs(target_type, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_notification_proofs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lifecycle_job_id UUID REFERENCES billing_lifecycle_jobs(id) ON DELETE SET NULL,
    pricing_email_batch_id UUID REFERENCES pricing_email_batches(id) ON DELETE SET NULL,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    target_type TEXT,
    target_id UUID,
    email_to TEXT NOT NULL,
    template_key TEXT NOT NULL,
    template_version TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_sha256 TEXT NOT NULL,
    provider_message_id TEXT,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'sent', 'failed', 'suppressed')),
    sent_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_notification_proofs_target
    ON billing_notification_proofs(target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_notification_proofs_user_created
    ON billing_notification_proofs(user_id, created_at DESC)
    WHERE user_id IS NOT NULL;

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS catalog_snapshot JSONB;

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS catalog_snapshot JSONB;

ALTER TABLE subscription_upgrade_orders
    ADD COLUMN IF NOT EXISTS plan_version_id UUID REFERENCES subscription_plan_versions(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS catalog_snapshot JSONB,
    ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'subscription_upgrade';

ALTER TABLE subscription_upgrade_orders
    DROP CONSTRAINT IF EXISTS subscription_upgrade_orders_order_type_check;

ALTER TABLE subscription_upgrade_orders
    ADD CONSTRAINT subscription_upgrade_orders_order_type_check
    CHECK (order_type IN ('subscription_upgrade', 'subscription_renewal'));

COMMIT;
