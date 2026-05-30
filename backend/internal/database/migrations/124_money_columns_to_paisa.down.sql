-- Revert F-065: BIGINT paisa back to DECIMAL(10,2) rupees, and restore the
-- fixed_incentive_inr column name. Guarded so each statement is a no-op if the
-- column is already in the target state.

-- Reverse 1) discount_applied : BIGINT paisa -> DECIMAL(10,2) rupees.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'coupon_redemptions'
          AND column_name = 'discount_applied'
          AND data_type = 'bigint'
    ) THEN
        ALTER TABLE coupon_redemptions
            ALTER COLUMN discount_applied TYPE DECIMAL(10,2)
            USING (discount_applied::numeric / 100);
    END IF;
END $$;

-- Reverse 2) fixed_incentive_paise (BIGINT paisa) -> fixed_incentive_inr (DECIMAL rupees).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'margin_ratios'
          AND column_name = 'fixed_incentive_paise'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'margin_ratios'
          AND column_name = 'fixed_incentive_inr'
    ) THEN
        ALTER TABLE margin_ratios
            RENAME COLUMN fixed_incentive_paise TO fixed_incentive_inr;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'margin_ratios'
          AND column_name = 'fixed_incentive_inr'
          AND data_type = 'bigint'
    ) THEN
        ALTER TABLE margin_ratios
            ALTER COLUMN fixed_incentive_inr TYPE DECIMAL(10,2)
            USING (fixed_incentive_inr::numeric / 100),
            ALTER COLUMN fixed_incentive_inr SET DEFAULT 0;
    END IF;
END $$;
