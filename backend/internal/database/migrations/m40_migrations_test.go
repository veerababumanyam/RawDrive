package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// M40 Round 1 — foundation migrations for the Upload Credit Meter feature:
//
//   097_upload_purchases          — ledger of paid/granted credit purchases
//   098_upload_ledger_entries     — append-only signed ledger (reserve/consume/refund/expire)
//   099_upload_credit_balances    — read-side view summing signed entries per workspace
//   100_upload_sessions_credit_reservation_id — FK from upload_sessions to an active reservation
//
// Mirrors the M39/M35/M34 file-content contract pattern: tests read the .up.sql
// and .down.sql files from disk and assert the required SQL substrings are
// present. No DB required. The shared migrationDir() helper lives in
// admin_migrations_test.go.

type m40Migration struct {
	Number          string
	Description     string
	UpMustContain   []string
	DownMustContain []string
}

var m40Migrations = []m40Migration{
	{
		Number:      "097",
		Description: "upload_purchases",
		UpMustContain: []string{
			"CREATE TABLE IF NOT EXISTS upload_purchases",
			"workspace_id",
			"idempotency_key",
			"amount_credits",
			"gateway",
			"UNIQUE (workspace_id, idempotency_key)",
		},
		DownMustContain: []string{
			"DROP TABLE IF EXISTS upload_purchases",
		},
	},
	{
		Number:      "098",
		Description: "upload_ledger_entries",
		UpMustContain: []string{
			"CREATE TABLE IF NOT EXISTS upload_ledger_entries",
			"workspace_id",
			"entry_type",
			"amount_credits",
			// The CHECK constraint pins the full set of valid entry_type values.
			// Any agent that adds a new type must update this constraint AND
			// this test — the coupling is intentional.
			"CHECK (entry_type IN",
			"'purchase'",
			"'grant_monthly'",
			"'grant_admin'",
			"'reserve'",
			"'consume'",
			"'refund'",
			"'expire'",
			"'unlimited_passthrough'",
			// Index on (workspace_id, created_at DESC) is called out in
			// feature-architecture-delta.md §Risks as the mitigation for
			// unbounded ledger growth. Without it, Balance() scans are O(n).
			"CREATE INDEX IF NOT EXISTS",
			"workspace_id",
			"created_at",
		},
		DownMustContain: []string{
			"DROP INDEX IF EXISTS",
			"DROP TABLE IF EXISTS upload_ledger_entries",
		},
	},
	{
		Number:      "099",
		Description: "upload_credit_balances",
		UpMustContain: []string{
			"CREATE OR REPLACE VIEW upload_credit_balances",
			"upload_ledger_entries",
			// The view must sum signed amounts per workspace.
			"SUM",
			"GROUP BY workspace_id",
		},
		DownMustContain: []string{
			"DROP VIEW IF EXISTS upload_credit_balances",
		},
	},
	{
		Number:      "100",
		Description: "upload_sessions_credit_reservation_id",
		UpMustContain: []string{
			"ALTER TABLE",
			"upload_sessions",
			"ADD COLUMN IF NOT EXISTS",
			"credit_reservation_id",
			// FK to the ledger entry representing the reservation.
			"REFERENCES upload_ledger_entries",
		},
		DownMustContain: []string{
			"ALTER TABLE",
			"upload_sessions",
			"DROP COLUMN IF EXISTS",
			"credit_reservation_id",
		},
	},
	{
		// M40 PERF-002: rollup table + trigger so the balance view and
		// the reserveDB gate are O(1) per workspace instead of O(n) over
		// the ledger. See docs/decisions/M40-PERF-002-credit-balance-rollup.md.
		Number:      "101",
		Description: "upload_credit_balance_rollup",
		UpMustContain: []string{
			"CREATE TABLE IF NOT EXISTS upload_credit_balance_rollup",
			"workspace_id",
			"total_credits",
			"plan_granted",
			"purchased",
			"reserved",
			"consumed",
			"refunded",
			"last_entry_at",
			// Trigger function — column math must mirror view 099 semantics.
			"CREATE OR REPLACE FUNCTION upload_credit_rollup_update",
			"ON CONFLICT (workspace_id) DO NOTHING",
			// Trigger wiring.
			"CREATE TRIGGER upload_credit_rollup_trg",
			"AFTER INSERT ON upload_ledger_entries",
			// Backfill existing workspaces.
			"INSERT INTO upload_credit_balance_rollup",
			"FROM upload_credit_balances",
			// View recreated as passthrough. DROP + CREATE (not
			// CREATE OR REPLACE) because the rollup columns are BIGINT
			// while the prior view columns were numeric — SQLSTATE 42P16
			// forbids replacing a view whose column types change.
			"DROP VIEW IF EXISTS upload_credit_balances",
			"CREATE VIEW upload_credit_balances",
			"FROM upload_credit_balance_rollup",
		},
		DownMustContain: []string{
			// The view must be restored to the SUM body BEFORE the rollup
			// table is dropped, otherwise the DROP TABLE fails with the
			// view depending on it. Down mirrors the up's DROP + CREATE
			// discipline for the same SQLSTATE 42P16 reason (BIGINT →
			// numeric is the other direction of the same forbidden
			// replace).
			"DROP VIEW IF EXISTS upload_credit_balances",
			"CREATE VIEW upload_credit_balances",
			"SUM(amount_credits)",
			"FROM upload_ledger_entries",
			"DROP TRIGGER IF EXISTS upload_credit_rollup_trg",
			"DROP FUNCTION IF EXISTS upload_credit_rollup_update",
			"DROP TABLE IF EXISTS upload_credit_balance_rollup",
		},
	},
}

func TestM40_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, m := range m40Migrations {
		upPath := filepath.Join(dir, m.Number+"_"+m.Description+".up.sql")
		downPath := filepath.Join(dir, m.Number+"_"+m.Description+".down.sql")
		t.Run(m.Number+"_up", func(t *testing.T) {
			info, err := os.Stat(upPath)
			require.NoError(t, err, "migration %s up.sql must exist at %s", m.Number, upPath)
			assert.Greater(t, info.Size(), int64(0), "%s up must not be empty", m.Number)
		})
		t.Run(m.Number+"_down", func(t *testing.T) {
			info, err := os.Stat(downPath)
			require.NoError(t, err, "migration %s down.sql must exist at %s", m.Number, downPath)
			assert.Greater(t, info.Size(), int64(0), "%s down must not be empty", m.Number)
		})
	}
}

func TestM40_097_UploadPurchases_Schema(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "097_upload_purchases.up.sql"))
	require.NoError(t, err)
	sql := string(content)

	for _, substr := range m40Migrations[0].UpMustContain {
		assert.Contains(t, sql, substr,
			"097 up must contain %q (webhook idempotency requires UNIQUE(workspace_id, idempotency_key))", substr)
	}
	assert.Contains(t, strings.ToUpper(sql), "IF NOT EXISTS",
		"097 up must use IF NOT EXISTS for idempotent replay")
}

func TestM40_097_UploadPurchases_Down(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "097_upload_purchases.down.sql"))
	require.NoError(t, err)
	sql := string(content)
	for _, substr := range m40Migrations[0].DownMustContain {
		assert.Contains(t, sql, substr, "097 down must contain %q", substr)
	}
}

func TestM40_098_LedgerEntries_Schema_AndEntryTypes(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "098_upload_ledger_entries.up.sql"))
	require.NoError(t, err)
	sql := string(content)

	for _, substr := range m40Migrations[1].UpMustContain {
		assert.Contains(t, sql, substr,
			"098 up must contain %q (append-only ledger with full entry_type enum)", substr)
	}

	// Append-only posture: no UPDATE or DELETE statements in the migration itself.
	// The rule is enforced at the application layer; the migration must not
	// provide convenience UPDATE/DELETE helpers that would undermine it.
	assert.NotContains(t, strings.ToUpper(sql), "CREATE OR REPLACE FUNCTION UPDATE_",
		"098 must not ship UPDATE helpers — ledger is append-only")
}

func TestM40_098_LedgerEntries_Down(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "098_upload_ledger_entries.down.sql"))
	require.NoError(t, err)
	sql := string(content)

	for _, substr := range m40Migrations[1].DownMustContain {
		assert.Contains(t, sql, substr, "098 down must contain %q", substr)
	}

	// Ordering: DROP INDEX before DROP TABLE (index references table).
	idxPos := strings.Index(sql, "DROP INDEX")
	tblPos := strings.Index(sql, "DROP TABLE")
	require.GreaterOrEqual(t, idxPos, 0, "098 down must include DROP INDEX")
	require.GreaterOrEqual(t, tblPos, 0, "098 down must include DROP TABLE")
	assert.Less(t, idxPos, tblPos, "098 down must DROP INDEX before DROP TABLE")
}

func TestM40_099_BalanceView_Schema(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "099_upload_credit_balances.up.sql"))
	require.NoError(t, err)
	sql := string(content)

	for _, substr := range m40Migrations[2].UpMustContain {
		assert.Contains(t, sql, substr,
			"099 view must sum signed ledger entries per workspace — missing %q", substr)
	}
}

func TestM40_099_BalanceView_Down(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "099_upload_credit_balances.down.sql"))
	require.NoError(t, err)
	sql := string(content)
	for _, substr := range m40Migrations[2].DownMustContain {
		assert.Contains(t, sql, substr, "099 down must contain %q", substr)
	}
}

func TestM40_100_SessionsReservationColumn_Schema(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "100_upload_sessions_credit_reservation_id.up.sql"))
	require.NoError(t, err)
	sql := string(content)

	for _, substr := range m40Migrations[3].UpMustContain {
		assert.Contains(t, sql, substr,
			"100 must add credit_reservation_id column with FK to ledger — missing %q", substr)
	}
	assert.Contains(t, strings.ToUpper(sql), "IF NOT EXISTS",
		"100 up must be idempotent (ADD COLUMN IF NOT EXISTS)")
}

func TestM40_100_SessionsReservationColumn_Down(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "100_upload_sessions_credit_reservation_id.down.sql"))
	require.NoError(t, err)
	sql := string(content)
	for _, substr := range m40Migrations[3].DownMustContain {
		assert.Contains(t, sql, substr, "100 down must contain %q", substr)
	}
}

// M40 PERF-002: balance-view scaling fix. Migration 101 adds a rollup
// table maintained by an AFTER INSERT trigger on upload_ledger_entries
// and replaces the view body with a passthrough over the rollup, so
// reads go from O(n) ledger sums to O(1) per workspace.

func TestM40_101_BalanceRollup_Schema(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "101_upload_credit_balance_rollup.up.sql"))
	require.NoError(t, err)
	sql := string(content)

	for _, substr := range m40Migrations[4].UpMustContain {
		assert.Contains(t, sql, substr,
			"101 up must establish the rollup table + trigger + view passthrough — missing %q", substr)
	}

	// View replacement ordering: the new CREATE VIEW pass must reference
	// the rollup table, not the old SUM body. Catches a future edit that
	// reintroduces the slow path "under" the new name. We anchor to the
	// `CREATE VIEW upload_credit_balances` spelling (post-DROP) because
	// CREATE OR REPLACE is forbidden here — see 101 up.sql SQLSTATE 42P16
	// rationale.
	viewIdx := strings.Index(sql, "CREATE VIEW upload_credit_balances")
	require.GreaterOrEqual(t, viewIdx, 0,
		"101 up must recreate upload_credit_balances via plain CREATE VIEW (after DROP), not CREATE OR REPLACE")
	rollupRefIdx := strings.Index(sql[viewIdx:], "FROM upload_credit_balance_rollup")
	require.Greater(t, rollupRefIdx, 0,
		"101 up must recreate upload_credit_balances as a rollup passthrough")

	// The CREATE VIEW must be preceded by a DROP VIEW IF EXISTS in the
	// same migration, otherwise the migration will fail with SQLSTATE
	// 42P16 on the column-type change (numeric -> BIGINT).
	dropViewIdx := strings.Index(sql, "DROP VIEW IF EXISTS upload_credit_balances")
	require.GreaterOrEqual(t, dropViewIdx, 0,
		"101 up must DROP VIEW IF EXISTS upload_credit_balances before recreating it")
	assert.Less(t, dropViewIdx, viewIdx,
		"101 up must DROP the old view BEFORE recreating it as a rollup passthrough")

	// Backfill must happen before the view is replaced, otherwise the
	// INSERT ... SELECT FROM upload_credit_balances would read from the
	// (already-empty) rollup.
	backfillIdx := strings.Index(sql, "INSERT INTO upload_credit_balance_rollup")
	require.Greater(t, backfillIdx, 0, "101 up must include a backfill INSERT")
	assert.Less(t, backfillIdx, dropViewIdx,
		"101 up must backfill from the old SUM view BEFORE dropping and replacing it")
}

func TestM40_101_BalanceRollup_Down(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "101_upload_credit_balance_rollup.down.sql"))
	require.NoError(t, err)
	sql := string(content)

	for _, substr := range m40Migrations[4].DownMustContain {
		assert.Contains(t, sql, substr, "101 down must contain %q", substr)
	}

	// Ordering: view restored BEFORE the rollup table is dropped,
	// otherwise Postgres refuses the DROP TABLE because the view
	// (post-up) depends on it. Down also uses DROP + CREATE to match
	// up's 42P16 discipline (BIGINT -> numeric column-type change).
	viewIdx := strings.Index(sql, "CREATE VIEW upload_credit_balances")
	dropTableIdx := strings.Index(sql, "DROP TABLE IF EXISTS upload_credit_balance_rollup")
	require.GreaterOrEqual(t, viewIdx, 0, "101 down must recreate the pre-101 view body via plain CREATE VIEW (after DROP)")
	require.GreaterOrEqual(t, dropTableIdx, 0, "101 down must drop the rollup table")
	assert.Less(t, viewIdx, dropTableIdx,
		"101 down must restore the view BEFORE dropping the rollup table")
}
