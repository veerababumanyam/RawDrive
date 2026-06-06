package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m178Base = "178_subscription_order_provider_payment_id"

func TestM178_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m178Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM178_AddsSubscriptionProviderPaymentID(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m178Base+".up.sql"))
	require.NoError(t, err)
	normalized := strings.Join(strings.Fields(string(body)), " ")

	assert.Contains(t, normalized, "ALTER TABLE subscription_upgrade_orders ADD COLUMN IF NOT EXISTS provider_payment_id TEXT")
	assert.Contains(t, normalized, "CREATE INDEX IF NOT EXISTS idx_sub_upgrade_provider_payment")
}

func TestM178_DownDropsSubscriptionProviderPaymentID(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m178Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_sub_upgrade_provider_payment")
	assert.Contains(t, content, "DROP COLUMN IF EXISTS provider_payment_id")
}
