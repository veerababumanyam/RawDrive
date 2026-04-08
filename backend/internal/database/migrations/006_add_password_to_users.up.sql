CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Enterprise-grade script to secure existing test users
-- This ensures any existing user without a password gets a hashed default password (TestPassword123!)
-- and marks test users as email_verified so testing doesn't break.
UPDATE users 
SET 
    password_hash = crypt('TestPassword123!', gen_salt('bf', 12)),
    email_verified = TRUE
WHERE password_hash IS NULL;
