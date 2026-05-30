-- F-015: Enforce the coupon redemption cap at the database level.
--
-- The application-side check (ValidateCoupon) and the increment
-- (IncrementRedemption) were split across two statements with no row lock,
-- allowing concurrent checkouts to both pass the check and both increment past
-- max_redemptions (TOCTOU over-redemption). The repository now uses a guarded
-- UPDATE, but this CHECK constraint is the final backstop: the database itself
-- refuses to ever let redemption_count exceed max_redemptions, regardless of
-- how the row is mutated.
--
-- A NULL max_redemptions means "unlimited" and is always allowed.
--
-- Postgres has no ADD CONSTRAINT ... IF NOT EXISTS, so guard with a DO block so
-- this migration is safe to (re)apply on a fresh database that may already have
-- the constraint.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'coupons_redemption_cap_chk'
    ) THEN
        ALTER TABLE coupons
            ADD CONSTRAINT coupons_redemption_cap_chk
            CHECK (max_redemptions IS NULL OR redemption_count <= max_redemptions);
    END IF;
END $$;
