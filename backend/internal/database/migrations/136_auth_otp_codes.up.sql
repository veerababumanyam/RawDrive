CREATE TABLE IF NOT EXISTS auth_otp_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purpose TEXT NOT NULL,
    identifier TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_otp_codes_active
    ON auth_otp_codes (purpose, identifier, created_at DESC)
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_otp_codes_expiry
    ON auth_otp_codes (expires_at);
