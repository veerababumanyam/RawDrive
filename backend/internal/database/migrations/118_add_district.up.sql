-- 118: add district column to users, freelancer_listings, gear_listings
ALTER TABLE users ADD COLUMN IF NOT EXISTS district VARCHAR(100);
ALTER TABLE freelancer_listings ADD COLUMN IF NOT EXISTS district VARCHAR(100);
ALTER TABLE gear_listings ADD COLUMN IF NOT EXISTS district VARCHAR(100);
