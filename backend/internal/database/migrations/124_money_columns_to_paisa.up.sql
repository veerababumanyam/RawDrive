-- F-065: Convert M6 monetary columns from legacy DECIMAL(10,2) rupees to the
-- canonical BIGINT-paisa convention used everywhere else in billing
-- (migration 022: subtotal_paisa, total_paisa, amount_paisa).
--
-- Two columns diverged from the convention:
--   * coupon_redemptions.discount_applied  (migration 027) DECIMAL(10,2)
--   * margin_ratios.fixed_incentive_inr    (migration 026) DECIMAL(10,2)
--
-- The Go code already treats these as int64 paisa:
--   * coupon_validation_service.go inserts a paisa int64 into discount_applied.
--   * margin_repository.go scans fixed_incentive_inr into FixedIncentiveINR int64,
--     which truncates the rupee value (500.00 -> 500 instead of 50000 paisa) and
--     errors on any fractional amount. This migration fixes the storage type and
--     renames the column to fixed_incentive_paise to make the unit unambiguous.
--
-- APPEND-ONLY + IDEMPOTENT: migrations 026/027 are committed and never edited
-- here. This is a new, higher-numbered migration (124 — 123 is taken by a sibling
-- branch). The runner records applied versions in schema_migrations and never
-- re-runs a file, so a production DB already past 026/027 receives this one-time
-- conversion, while a fresh DB gets BIGINT directly from 027's corrected up.sql
-- and from this migration's guarded rename of 026's column. Every statement is
-- guarded so the migration is a safe no-op whichever type/name the column already
-- has.

-- 1) coupon_redemptions.discount_applied : DECIMAL(10,2) rupees -> BIGINT paisa.
--    On a fresh DB (027 already BIGINT) the data_type check makes this a no-op.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'coupon_redemptions'
          AND column_name = 'discount_applied'
          AND data_type = 'numeric'
    ) THEN
        ALTER TABLE coupon_redemptions
            ALTER COLUMN discount_applied TYPE BIGINT
            USING ROUND(discount_applied * 100)::BIGINT;
    END IF;
END $$;

-- 2) margin_ratios.fixed_incentive_inr (rupees, DECIMAL) ->
--    margin_ratios.fixed_incentive_paise (paisa, BIGINT).
--    Convert the value first (only when still numeric), then rename.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'margin_ratios'
          AND column_name = 'fixed_incentive_inr'
          AND data_type = 'numeric'
    ) THEN
        ALTER TABLE margin_ratios
            ALTER COLUMN fixed_incentive_inr TYPE BIGINT
            USING ROUND(fixed_incentive_inr * 100)::BIGINT,
            ALTER COLUMN fixed_incentive_inr SET DEFAULT 0;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'margin_ratios'
          AND column_name = 'fixed_incentive_inr'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'margin_ratios'
          AND column_name = 'fixed_incentive_paise'
    ) THEN
        ALTER TABLE margin_ratios
            RENAME COLUMN fixed_incentive_inr TO fixed_incentive_paise;
    END IF;
END $$;
