-- M6 extension: Sub-dealers — city/district-level representatives under a state dealer

CREATE TABLE IF NOT EXISTS sub_dealers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id     UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
    state_id      INTEGER NOT NULL REFERENCES states(id),
    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255),
    phone         VARCHAR(20),
    city_district VARCHAR(255) NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('pending', 'active', 'suspended')),
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_dealers_dealer_id ON sub_dealers(dealer_id);
CREATE INDEX IF NOT EXISTS idx_sub_dealers_state_id  ON sub_dealers(state_id);
