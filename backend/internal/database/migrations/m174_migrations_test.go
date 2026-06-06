package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 174 — signup_payment_orders, the pre-workspace payment order table
// for the paid-duplicate-phone signup funnel (slice 4). Hermetic file-content
// contract test.

const m174Base = "174_signup_payment_orders"

func TestM174_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m174Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM174_Up_CreatesSignupOrderTable(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m174Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := normalizeWhitespace(content)

	assert.Contains(t, content, "BEGIN")
	assert.Contains(t, content, "COMMIT")
	assert.Contains(t, content, "CREATE TABLE IF NOT EXISTS signup_payment_orders",
		"up must create signup_payment_orders idempotently")

	// Keyed by user (not workspace) — the defining property of this table.
	assert.Contains(t, normalized, "user_id UUID NOT NULL REFERENCES users(id)",
		"orders are keyed by user (pre-workspace)")
	// workspace_id is nullable, linked on settlement.
	assert.Contains(t, normalized, "workspace_id UUID REFERENCES workspaces(id)",
		"workspace_id links the created workspace on settlement")

	// Status + provider domains are constrained.
	assert.Contains(t, normalized, "status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed'))",
		"status must be constrained")
	assert.Contains(t, normalized, "provider VARCHAR(20) NOT NULL CHECK (provider IN ('razorpay', 'phonepe'))",
		"provider must be constrained")
	assert.Contains(t, normalized, "amount_paise BIGINT NOT NULL CHECK (amount_paise > 0)",
		"amount must be positive")

	// Idempotent provider lookup (unique so a redelivered webhook can't create a
	// duplicate order row).
	assert.Contains(t, normalized, "CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_payment_orders_provider_order",
		"provider order lookup must be a unique index")
}

func TestM174_Down_DropsTable(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m174Base+".down.sql"))
	require.NoError(t, err)
	assert.Contains(t, string(body), "DROP TABLE IF EXISTS signup_payment_orders",
		"down must drop the table idempotently")
}
