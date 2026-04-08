-- M5: Freelancer Marketplace tables
-- Migration 000014: freelancer_listings, freelancer_reviews, marketplace_inquiries

-- Freelancer Listings
CREATE TABLE IF NOT EXISTS freelancer_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    state_id INTEGER NOT NULL REFERENCES states(id),
    title VARCHAR(255) NOT NULL,
    specializations TEXT[] NOT NULL DEFAULT '{}',
    city VARCHAR(100),
    daily_rate_paisa BIGINT,
    description TEXT,
    portfolio_gallery_id UUID REFERENCES galleries(id) ON DELETE SET NULL,
    availability_calendar JSONB DEFAULT '{}',
    is_published BOOLEAN NOT NULL DEFAULT false,
    rating_avg DECIMAL(3,2),
    review_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_freelancer_listings_user ON freelancer_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_freelancer_listings_state_city ON freelancer_listings(state_id, city) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_freelancer_listings_specializations ON freelancer_listings USING GIN(specializations);
CREATE INDEX IF NOT EXISTS idx_freelancer_listings_workspace ON freelancer_listings(workspace_id);

ALTER TABLE freelancer_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS freelancer_listings_public_read ON freelancer_listings;
CREATE POLICY freelancer_listings_public_read ON freelancer_listings
    FOR SELECT USING (is_published = true OR user_id = current_setting('app.current_user_id', true)::uuid);

DROP POLICY IF EXISTS freelancer_listings_owner_manage ON freelancer_listings;
CREATE POLICY freelancer_listings_owner_manage ON freelancer_listings
    FOR ALL USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- Freelancer Reviews
CREATE TABLE IF NOT EXISTS freelancer_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES freelancer_listings(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    booking_id UUID,
    rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(booking_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_freelancer_reviews_listing ON freelancer_reviews(listing_id);
CREATE INDEX IF NOT EXISTS idx_freelancer_reviews_reviewer ON freelancer_reviews(reviewer_id);

ALTER TABLE freelancer_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS freelancer_reviews_public_read ON freelancer_reviews;
CREATE POLICY freelancer_reviews_public_read ON freelancer_reviews
    FOR SELECT USING (true);

DROP POLICY IF EXISTS freelancer_reviews_author_manage ON freelancer_reviews;
CREATE POLICY freelancer_reviews_author_manage ON freelancer_reviews
    FOR ALL USING (reviewer_id = current_setting('app.current_user_id', true)::uuid);

-- Marketplace Inquiries
CREATE TABLE IF NOT EXISTS marketplace_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_type VARCHAR(20) NOT NULL CHECK (inquiry_type IN ('freelancer', 'gear')),
    listing_id UUID NOT NULL,
    from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    event_date DATE,
    duration_days INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'read', 'replied', 'declined')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_inquiries_from ON marketplace_inquiries(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_inquiries_to ON marketplace_inquiries(to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_inquiries_listing ON marketplace_inquiries(listing_id);

ALTER TABLE marketplace_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_inquiries_participant ON marketplace_inquiries;
CREATE POLICY marketplace_inquiries_participant ON marketplace_inquiries
    FOR ALL USING (
        from_user_id = current_setting('app.current_user_id', true)::uuid
        OR to_user_id = current_setting('app.current_user_id', true)::uuid
    );

-- Hire Requests (freelancer booking lifecycle)
CREATE TABLE IF NOT EXISTS hire_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES freelancer_listings(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    freelancer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_details TEXT,
    event_date DATE,
    compensation_paisa BIGINT,
    requirements TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'sent'
        CHECK (status IN ('sent', 'accepted', 'declined', 'confirmed', 'completed', 'cancelled')),
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hire_requests_requester ON hire_requests(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hire_requests_freelancer ON hire_requests(freelancer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hire_requests_listing ON hire_requests(listing_id);

ALTER TABLE hire_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hire_requests_participant ON hire_requests;
CREATE POLICY hire_requests_participant ON hire_requests
    FOR ALL USING (
        requester_id = current_setting('app.current_user_id', true)::uuid
        OR freelancer_id = current_setting('app.current_user_id', true)::uuid
    );
