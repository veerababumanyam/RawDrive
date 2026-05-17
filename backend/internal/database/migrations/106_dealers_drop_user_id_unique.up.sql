-- Allow admins to create multiple dealer records (one admin may manage
-- multiple dealerships). The application-level uniqueness check on
-- RegisterDealer still prevents self-registering users from duplicating,
-- but AdminCreateDealer intentionally skips that check.
DROP INDEX IF EXISTS idx_dealers_user_id;
