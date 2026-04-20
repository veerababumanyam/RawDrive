-- M40 / Upload Credit Meter — 099: upload_credit_balances view
--
-- Read-side projection over upload_ledger_entries. The view computes the
-- current balance plus a breakdown into plan_granted / purchased / reserved
-- so the Balance() service can return the BalanceView struct without running
-- three separate queries.

CREATE OR REPLACE VIEW upload_credit_balances AS
SELECT
    workspace_id,
    SUM(amount_credits)                                               AS total_credits,
    SUM(CASE WHEN entry_type IN ('grant_monthly', 'grant_admin')
             THEN amount_credits ELSE 0 END)                          AS plan_granted,
    SUM(CASE WHEN entry_type = 'purchase'
             THEN amount_credits ELSE 0 END)                          AS purchased,
    -- Active reservations contribute a negative amount_credits to
    -- total_credits until Consume/Refund posts the paired entry. Reporting
    -- the absolute reserved amount is what the UI pill expects.
    SUM(CASE WHEN entry_type = 'reserve'
             THEN -amount_credits ELSE 0 END)                         AS reserved,
    SUM(CASE WHEN entry_type = 'consume'
             THEN amount_credits ELSE 0 END)                          AS consumed,
    SUM(CASE WHEN entry_type = 'refund'
             THEN amount_credits ELSE 0 END)                          AS refunded,
    MAX(created_at)                                                   AS last_entry_at
FROM upload_ledger_entries
GROUP BY workspace_id;

COMMENT ON VIEW upload_credit_balances IS
    'M40 Upload Credit Meter: signed sum of ledger entries per workspace. Read-side projection for Balance() service.';
