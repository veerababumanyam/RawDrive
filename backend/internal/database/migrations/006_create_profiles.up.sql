CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    business_name VARCHAR(255),
    photographer_type VARCHAR(50),
    city VARCHAR(100),
    pin_code VARCHAR(10),
    gstin VARCHAR(15),
    logo_url TEXT,
    onboarding_step INT NOT NULL DEFAULT 0
);
