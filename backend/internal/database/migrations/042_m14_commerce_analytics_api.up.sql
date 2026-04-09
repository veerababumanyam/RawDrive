-- M14: Gallery Commerce, Analytics & APIs
-- Creates: download_jobs, download_events, gallery_products, gallery_carts,
--          gallery_orders, gallery_analytics_events, gallery_analytics_daily,
--          api_keys, webhooks, webhook_deliveries

-- Download Jobs (bulk ZIP tracking)
CREATE TABLE IF NOT EXISTS download_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    requested_by_name TEXT,
    requested_by_email TEXT,
    requested_by_user_id UUID REFERENCES users(id),
    asset_ids UUID[] NOT NULL DEFAULT '{}',
    variant TEXT NOT NULL DEFAULT 'original',
    status TEXT NOT NULL DEFAULT 'pending',
    progress INTEGER NOT NULL DEFAULT 0,
    total_assets INTEGER NOT NULL DEFAULT 0,
    download_url TEXT,
    file_size_bytes BIGINT,
    error_message TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_download_jobs_gallery ON download_jobs(gallery_id);
CREATE INDEX IF NOT EXISTS idx_download_jobs_status ON download_jobs(status) WHERE status IN ('pending', 'processing');

-- Download Events (audit trail)
CREATE TABLE IF NOT EXISTS download_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    download_job_id UUID REFERENCES download_jobs(id),
    downloader_name TEXT,
    downloader_email TEXT,
    downloader_user_id UUID REFERENCES users(id),
    downloader_ip TEXT,
    variant TEXT NOT NULL DEFAULT 'original',
    file_size_bytes BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_download_events_gallery ON download_events(gallery_id);
CREATE INDEX IF NOT EXISTS idx_download_events_asset ON download_events(asset_id);

-- Gallery Products (digital, print, album, bundle)
CREATE TABLE IF NOT EXISTS gallery_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    product_type TEXT NOT NULL DEFAULT 'digital',
    price_amount INTEGER NOT NULL DEFAULT 0,
    price_currency TEXT NOT NULL DEFAULT 'INR',
    asset_id UUID REFERENCES assets(id),
    config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_products_gallery ON gallery_products(gallery_id) WHERE is_active = true;

-- Gallery Carts (persistent client cart)
CREATE TABLE IF NOT EXISTS gallery_carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    client_email TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]',
    coupon_code TEXT,
    subtotal INTEGER NOT NULL DEFAULT 0,
    discount INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT gallery_carts_unique UNIQUE (gallery_id, client_email)
);

-- Gallery Orders
CREATE TABLE IF NOT EXISTS gallery_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    cart_id UUID REFERENCES gallery_carts(id),
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]',
    subtotal INTEGER NOT NULL DEFAULT 0,
    discount INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'pending',
    payment_id TEXT,
    fulfillment_status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_orders_gallery ON gallery_orders(gallery_id);
CREATE INDEX IF NOT EXISTS idx_gallery_orders_workspace ON gallery_orders(workspace_id);

-- Gallery Analytics Events (raw event stream)
CREATE TABLE IF NOT EXISTS gallery_analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    asset_id UUID,
    visitor_ip TEXT,
    visitor_user_agent TEXT,
    visitor_email TEXT,
    referrer TEXT,
    device_type TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_gallery ON gallery_analytics_events(gallery_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON gallery_analytics_events(gallery_id, event_type);

-- Gallery Analytics Daily (aggregated rollup)
CREATE TABLE IF NOT EXISTS gallery_analytics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    unique_visitors INTEGER NOT NULL DEFAULT 0,
    downloads INTEGER NOT NULL DEFAULT 0,
    favorites INTEGER NOT NULL DEFAULT 0,
    shares INTEGER NOT NULL DEFAULT 0,
    proofing_actions INTEGER NOT NULL DEFAULT 0,
    device_breakdown JSONB DEFAULT '{}',
    referrer_breakdown JSONB DEFAULT '{}',
    CONSTRAINT analytics_daily_unique UNIQUE (gallery_id, date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_gallery ON gallery_analytics_daily(gallery_id, date DESC);

-- API Keys (scoped access for integrations)
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    rate_limit INTEGER NOT NULL DEFAULT 1000,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_api_keys_workspace ON api_keys(workspace_id) WHERE is_active = true;

-- Webhooks (event subscription configs)
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_workspace ON webhooks(workspace_id) WHERE is_active = true;

-- Webhook Deliveries (delivery audit log)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    response_status INTEGER,
    response_body TEXT,
    attempt INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status) WHERE status IN ('pending', 'failed');

-- ALTER galleries: add M14 columns
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS allow_downloads BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS download_quality TEXT NOT NULL DEFAULT 'original';
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS watermark_enabled BOOLEAN NOT NULL DEFAULT false;
