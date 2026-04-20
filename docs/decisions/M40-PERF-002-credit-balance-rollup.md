# M40 PERF-002 — Upload Credit Balance Rollup

Resolved during M40 build (2026-04-20). Closes the last open item from the M40
review cycle after PR #37 + PR #38 landed the other 11 findings.

## Problem statement

`upload_credit_balances` (migration 099) is a plain SQL view that re-sums every
`upload_ledger_entries` row per workspace on every read:

```sql
CREATE OR REPLACE VIEW upload_credit_balances AS
SELECT workspace_id,
       SUM(amount_credits)                                              AS total_credits,
       SUM(CASE WHEN entry_type IN ('grant_monthly','grant_admin')
                THEN amount_credits ELSE 0 END)                         AS plan_granted,
       ...
  FROM upload_ledger_entries
 GROUP BY workspace_id;
```

- `credit.Service.Balance` calls it on every `GET /api/v1/uploads/balance`.
- `credit.Service.reserveDB` does a similar `SELECT COALESCE(SUM(amount_credits), 0) FROM upload_ledger_entries WHERE workspace_id = $1 FOR UPDATE` on every CreateSession.
- Index `idx_upload_ledger_workspace_created` (migration 098) narrows the scan but the aggregate still visits every row.

As the ledger grows (one reserve + one consume per upload, plus purchases / grants / expires), this becomes O(n) per balance read and per reservation. NFR-UCR-P1 (balance p95 < 200ms) is at risk once any single workspace crosses ~10⁴ ledger rows.

## D1. Rollup strategy

**Decision**: Add a `upload_credit_balance_rollup` table keyed by `workspace_id` and maintain it via an append-only trigger on `upload_ledger_entries`. Replace the view body with a direct `SELECT` from the rollup table.

### D1.1 Options considered

| # | Option | Why not |
|---|---|---|
| A | `CREATE MATERIALIZED VIEW` + periodic `REFRESH CONCURRENTLY` | Financial balance tracking cannot tolerate staleness bounded by refresh cadence. `REFRESH` itself is O(n) per workspace; doesn't actually fix the problem, just moves the cost. |
| B | DB trigger maintains a rollup table (**chosen**) | O(1) reads, always-fresh, inserts still atomic with their rollup update via the same tx, works for every writer (credit.go, test fixtures, admin endpoints, future webhook paths). |
| C | App-code maintains rollup in every service method | Requires every path that inserts ledger rows to remember to UPSERT the rollup. Easy to regress — a future test fixture or admin endpoint that bypasses the service gets the rollup silently out of sync. Trigger removes the obligation from the caller. |
| D | Valkey cache with TTL | Introduces external-dependency staleness on a financial endpoint; cache-consistency problems on concurrent reserves. Out of scope. |

### D1.2 Rollup table

```sql
CREATE TABLE upload_credit_balance_rollup (
    workspace_id   UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    total_credits  BIGINT NOT NULL DEFAULT 0,
    plan_granted   BIGINT NOT NULL DEFAULT 0,
    purchased      BIGINT NOT NULL DEFAULT 0,
    reserved       BIGINT NOT NULL DEFAULT 0,
    consumed       BIGINT NOT NULL DEFAULT 0,
    refunded       BIGINT NOT NULL DEFAULT 0,
    last_entry_at  TIMESTAMPTZ,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

One row per workspace. Columns mirror the view's output columns **exactly** so the handler + adapter contract stays unchanged — the view becomes a passthrough.

### D1.3 Trigger

`AFTER INSERT` on `upload_ledger_entries`. Upload ledger is append-only (migration 098's design note), so no UPDATE/DELETE trigger is needed; an accidental UPDATE/DELETE on ledger rows would create rollup drift, but is already forbidden at the application layer.

Logic (one SQL `UPDATE` per ledger insert):

```sql
total_credits += NEW.amount_credits
plan_granted  += NEW.amount_credits when entry_type IN ('grant_monthly','grant_admin')
purchased     += NEW.amount_credits when entry_type = 'purchase'
reserved      += -NEW.amount_credits when entry_type = 'reserve'
consumed      += NEW.amount_credits when entry_type = 'consume'
refunded      += NEW.amount_credits when entry_type = 'refund'
last_entry_at  = GREATEST(last_entry_at, NEW.created_at)
updated_at     = now()
```

The trigger `INSERT ... ON CONFLICT DO NOTHING` first to guarantee the row exists before the UPDATE.

### D1.4 View recreation

Post-rollup, migration 101 recreates `upload_credit_balances` as a thin passthrough:

```sql
CREATE OR REPLACE VIEW upload_credit_balances AS
SELECT workspace_id, total_credits, plan_granted, purchased, reserved, consumed, refunded, last_entry_at
  FROM upload_credit_balance_rollup;
```

Handler code, adapter, and `Balance()` all continue to query the view — zero call-site changes for the read path.

### D1.5 Backfill

Inside the same migration, after the table + trigger exist but before the view is replaced, bulk-insert the current view state into the rollup:

```sql
INSERT INTO upload_credit_balance_rollup (
    workspace_id, total_credits, plan_granted, purchased, reserved, consumed, refunded, last_entry_at
)
SELECT workspace_id, total_credits, plan_granted, purchased, reserved, consumed, refunded, last_entry_at
  FROM upload_credit_balances
    ON CONFLICT (workspace_id) DO NOTHING;
```

The `ON CONFLICT DO NOTHING` covers the edge case where the trigger fired during the migration (e.g. a concurrent insert) and created the rollup row before the backfill got there.

## D2. App-code change

Only one call site changes: `credit.Service.reserveDB`'s balance gate.

**Before** (O(n) ledger sum):

```go
var available int64
err = tx.QueryRow(ctx, `
    SELECT COALESCE(SUM(amount_credits), 0)
      FROM upload_ledger_entries
     WHERE workspace_id = $1
     FOR UPDATE
`, in.WorkspaceID).Scan(&available)
```

**After** (O(1) rollup lookup):

```go
var available int64
err = tx.QueryRow(ctx, `
    SELECT total_credits
      FROM upload_credit_balance_rollup
     WHERE workspace_id = $1
     FOR UPDATE
`, in.WorkspaceID).Scan(&available)
if errors.Is(err, pgx.ErrNoRows) {
    // No rollup row == no ledger entries == zero balance.
    available = 0
    err = nil
}
```

- Concurrency / NFR-UCR-R2 preserved: `SELECT ... FOR UPDATE` on a single row still serialises concurrent Reserves against the same workspace. The winner's trigger updates rollup; the loser blocks, re-reads, sees insufficient balance, rejects.
- `Balance()`, `consumeDB`, `refundDB`, and `ExpireAbandoned` do **not** change — the trigger maintains the rollup for all their inserts automatically.

## D3. Rollback / recovery

- Migration 101 down: drops trigger, drops function, drops rollup table, recreates the original view body from 099.
- If a trigger bug drifts the rollup: one-shot correction is a straight re-backfill against a temporary SUM query. Ledger rows are never touched, so `DROP TABLE upload_credit_balance_rollup CASCADE` followed by re-running 101 up is always safe.

## D4. Observability / testing

- `m40_migrations_test.go` gains a block pinning migration 101's substrings (table, trigger function, trigger, view recreation, backfill).
- Integration test `credit_integration_test.go` is unchanged; all three scenarios still assert via `Balance()` and the `InsufficientBalanceDetails` error, which continue to return the same values.
- A new integration test block verifies: after N inserts, the rollup column values equal the view's SUM equivalents (rollup-vs-truth invariant).

## D5. Known-not-fixed scope

The view's pre-existing column semantics carry over unchanged:

- `reserved` is a lifetime-reserved counter (includes reservations that have been consumed, refunded, or expired), not an active-reserved count. If the UI needs "pending reservations only", that's a separate finding — not fixed here because changing it would silently alter handler response values that the frontend hook may depend on.
- `consumed` and `refunded` carry the sign of the underlying ledger entry (consumed is negative, refunded is positive). Same principle — frozen by contract.

These are flagged for a future M41+ follow-up review.
