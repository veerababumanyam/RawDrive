-- M40 / Upload Credit Meter — 101: balance rollup table + trigger
--
-- PERF-002 fix. The read path for /api/v1/uploads/balance and the balance
-- gate in credit.reserveDB both used a GROUP BY SUM over upload_ledger_entries
-- in view 099, which scales O(n) per workspace ledger depth. NFR-UCR-P1
-- (balance p95 < 200ms) is at risk once a workspace crosses ~10⁴ ledger rows.
--
-- Strategy (see docs/decisions/M40-PERF-002-credit-balance-rollup.md):
--   1. Add `upload_credit_balance_rollup` keyed on workspace_id.
--   2. Maintain it via an AFTER INSERT trigger on upload_ledger_entries.
--      Ledger is append-only (098's design note), so INSERT-only is sufficient.
--   3. Backfill existing rows from view 099.
--   4. Recreate view 099 as a thin passthrough over the rollup so every
--      existing call site (handler, adapter, Balance()) keeps working with
--      zero code change.

-- 1. Rollup table.
CREATE TABLE IF NOT EXISTS upload_credit_balance_rollup (
    workspace_id  UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    total_credits BIGINT NOT NULL DEFAULT 0,
    plan_granted  BIGINT NOT NULL DEFAULT 0,
    purchased     BIGINT NOT NULL DEFAULT 0,
    reserved      BIGINT NOT NULL DEFAULT 0,
    consumed      BIGINT NOT NULL DEFAULT 0,
    refunded      BIGINT NOT NULL DEFAULT 0,
    last_entry_at TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE upload_credit_balance_rollup IS
    'M40 PERF-002: per-workspace rollup of upload_ledger_entries signed sums. Maintained by AFTER INSERT trigger. Read via view upload_credit_balances.';

-- 2. Trigger function. Column math MUST mirror the view body of migration 099
-- so the rollup and any future ad-hoc SUM query agree on every column.
CREATE OR REPLACE FUNCTION upload_credit_rollup_update() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Guarantee the row exists before the update. Cheap no-op on the hot
    -- path once the workspace has any ledger history.
    INSERT INTO upload_credit_balance_rollup (workspace_id)
    VALUES (NEW.workspace_id)
    ON CONFLICT (workspace_id) DO NOTHING;

    UPDATE upload_credit_balance_rollup
       SET total_credits = total_credits + NEW.amount_credits,
           plan_granted  = plan_granted
                           + CASE WHEN NEW.entry_type IN ('grant_monthly','grant_admin')
                                  THEN NEW.amount_credits ELSE 0 END,
           purchased     = purchased
                           + CASE WHEN NEW.entry_type = 'purchase'
                                  THEN NEW.amount_credits ELSE 0 END,
           reserved      = reserved
                           + CASE WHEN NEW.entry_type = 'reserve'
                                  THEN -NEW.amount_credits ELSE 0 END,
           consumed      = consumed
                           + CASE WHEN NEW.entry_type = 'consume'
                                  THEN NEW.amount_credits ELSE 0 END,
           refunded      = refunded
                           + CASE WHEN NEW.entry_type = 'refund'
                                  THEN NEW.amount_credits ELSE 0 END,
           last_entry_at = GREATEST(last_entry_at, NEW.created_at),
           updated_at    = now()
     WHERE workspace_id = NEW.workspace_id;

    RETURN NEW;
END;
$$;

-- 3. Trigger wiring. AFTER INSERT so the inserted row is visible to GREATEST
-- (NEW.created_at) and to any downstream consistency check. Ledger is
-- append-only — no UPDATE/DELETE trigger is needed.
DROP TRIGGER IF EXISTS upload_credit_rollup_trg ON upload_ledger_entries;
CREATE TRIGGER upload_credit_rollup_trg
AFTER INSERT ON upload_ledger_entries
FOR EACH ROW
EXECUTE FUNCTION upload_credit_rollup_update();

-- 4. Backfill from the existing view. The view still resolves via 099's
-- SUM body at this point (replaced further down), so this populates the
-- rollup to match current reality. ON CONFLICT guards against the edge
-- case where the trigger fired during migration replay.
INSERT INTO upload_credit_balance_rollup (
    workspace_id, total_credits, plan_granted, purchased, reserved, consumed, refunded, last_entry_at
)
SELECT
    workspace_id,
    COALESCE(total_credits, 0),
    COALESCE(plan_granted, 0),
    COALESCE(purchased, 0),
    COALESCE(reserved, 0),
    COALESCE(consumed, 0),
    COALESCE(refunded, 0),
    last_entry_at
  FROM upload_credit_balances
    ON CONFLICT (workspace_id) DO NOTHING;

-- 5. Replace the view body with a thin passthrough over the rollup. Same
-- column set + ordering as 099 so existing callers see no shape change.
CREATE OR REPLACE VIEW upload_credit_balances AS
SELECT
    workspace_id,
    total_credits,
    plan_granted,
    purchased,
    reserved,
    consumed,
    refunded,
    last_entry_at
  FROM upload_credit_balance_rollup;

COMMENT ON VIEW upload_credit_balances IS
    'M40 Upload Credit Meter: read-side projection of the per-workspace rollup (migration 101). Maintained via AFTER INSERT trigger on upload_ledger_entries.';
