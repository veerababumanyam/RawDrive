-- Reverse F-015: drop the redemption-cap CHECK constraint.
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_redemption_cap_chk;
