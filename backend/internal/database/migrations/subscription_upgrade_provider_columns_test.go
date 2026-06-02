package migrations_test

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func normalizeSubscriptionUpgradeProviderSQL(sql string) string {
	return regexp.MustCompile(`\s+`).ReplaceAllString(strings.ToLower(sql), " ")
}

func TestSubscriptionUpgradeProviderColumnsMigration(t *testing.T) {
	dir := migrationDir(t)
	up, err := os.ReadFile(filepath.Join(dir, "140_subscription_upgrade_order_provider_columns.up.sql"))
	require.NoError(t, err)
	normalized := normalizeSubscriptionUpgradeProviderSQL(string(up))

	assert.Contains(t, normalized, "add column if not exists provider")
	assert.Contains(t, normalized, "add column if not exists provider_order_id")
	assert.Contains(t, normalized, "provider in ('razorpay', 'phonepe')")
	assert.Contains(t, normalized, "unique index if not exists idx_sub_upgrade_provider_order")
	assert.Contains(t, normalized, "on subscription_upgrade_orders(provider, provider_order_id)")
}

func TestSubscriptionUpgradeProviderColumnsDownMigration(t *testing.T) {
	dir := migrationDir(t)
	down, err := os.ReadFile(filepath.Join(dir, "140_subscription_upgrade_order_provider_columns.down.sql"))
	require.NoError(t, err)
	normalized := normalizeSubscriptionUpgradeProviderSQL(string(down))

	assert.Contains(t, normalized, "drop index if exists idx_sub_upgrade_provider_order")
	assert.Contains(t, normalized, "drop column if exists provider_order_id")
	assert.Contains(t, normalized, "drop column if exists provider")
}
