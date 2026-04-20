-- M40 / Upload Credit Meter — 101 down
--
-- Tears the rollup apart and restores view 099's original SUM body so
-- Balance() and the handler keep working on the downgraded schema.

-- 1. Restore the view to 099's original body (signed-sum over ledger).
--    The post-101 view references upload_credit_balance_rollup which we
--    are about to drop, so this must run BEFORE the DROP TABLE.
CREATE OR REPLACE VIEW upload_credit_balances AS
SELECT
    workspace_id,
    SUM(amount_credits)                                               AS total_credits,
    SUM(CASE WHEN entry_type IN ('grant_monthly', 'grant_admin')
             THEN amount_credits ELSE 0 END)                          AS plan_granted,
    SUM(CASE WHEN entry_type = 'purchase'
             THEN amount_credits ELSE 0 END)                          AS purchased,
    SUM(CASE WHEN entry_type = 'reserve'
             THEN -amount_credits ELSE 0 END)                         AS reserved,
    SUM(CASE WHEN entry_type = 'consume'
             THEN amount_credits ELSE 0 END)                          AS consumed,
    SUM(CASE WHEN entry_type = 'refund'
             THEN amount_credits ELSE 0 END)                          AS refunded,
    MAX(created_at)                                                   AS last_entry_at
FROM upload_ledger_entries
GROUP BY workspace_id;

-- 2. Drop trigger + function + table.
DROP TRIGGER IF EXISTS upload_credit_rollup_trg ON upload_ledger_entries;
DROP FUNCTION IF EXISTS upload_credit_rollup_update();
DROP TABLE IF EXISTS upload_credit_balance_rollup;
