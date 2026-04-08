-- M5: Gear Rental Marketplace tables
-- Migration 000015: gear_listings, gear_bookings

CREATE TABLE IF NOT EXISTS gear_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    state_id INTEGER NOT NULL REFERENCES states(id),
    listing_type VARCHAR(10) NOT NULL CHECK (listing_type IN ('rental', 'sale')),
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('camera_body', 'lens', 'lighting', 'audio', 'accessory')),
    brand VARCHAR(100),
    model VARCHAR(100),
    condition VARCHAR(20) CHECK (condition IN ('new', 'like_new', 'good', 'fair', 'poor')),
    price_paisa BIGINT NOT NULL,
    description TEXT,
    images JSONB NOT NULL DEFAULT '[]',
    city VARCHAR(100),
    is_published BOOLEAN NOT NULL DEFAULT false,
    is_available BOOLEAN NOT NULL DEFAULT true,
    availability_calendar JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gear_listings_user ON gear_listings(user_id);
CREATE INDEX idx_gear_listings_state_type ON gear_listings(state_id, listing_type) WHERE is_published = true;
CREATE INDEX idx_gear_listings_category_brand ON gear_listings(category, brand);
CREATE INDEX idx_gear_listings_workspace ON gear_listings(workspace_id);

ALTER TABLE gear_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY gear_listings_public_read ON gear_listings
    FOR SELECT USING (is_published = true OR user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY gear_listings_owner_manage ON gear_listings
    FOR ALL USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- Gear Bookings
CREATE TABLE IF NOT EXISTS gear_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gear_listing_id UUID NOT NULL REFERENCES gear_listings(id) ON DELETE CASCADE,
    renter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_paisa BIGINT NOT NULL,
    deposit_paisa BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'declined', 'active', 'returned', 'disputed', 'completed')),
    owner_message TEXT,
    renter_message TEXT,
    return_photos JSONB DEFAULT '[]',
    dispute_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_date >= start_date)
);

CREATE INDEX idx_gear_bookings_renter ON gear_bookings(renter_id, created_at DESC);
CREATE INDEX idx_gear_bookings_owner ON gear_bookings(owner_id, created_at DESC);
CREATE INDEX idx_gear_bookings_listing ON gear_bookings(gear_listing_id);
CREATE INDEX idx_gear_bookings_dates ON gear_bookings(gear_listing_id, start_date, end_date) WHERE status IN ('pending', 'approved', 'active');

ALTER TABLE gear_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY gear_bookings_participant ON gear_bookings
    FOR ALL USING (
        renter_id = current_setting('app.current_user_id', true)::uuid
        OR owner_id = current_setting('app.current_user_id', true)::uuid
    );
