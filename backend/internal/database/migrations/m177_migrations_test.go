package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m177Base = "177_pricing_governance_and_products"

func TestM177_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m177Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM177_UpCreatesGovernanceProductBillingFoundation(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m177Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := strings.Join(strings.Fields(content), " ")

	assert.Contains(t, content, "BEGIN", "up must be transactional")
	assert.Contains(t, content, "COMMIT", "up must commit")
	for _, table := range []string{
		"pricing_change_requests",
		"pricing_audit_events",
		"billing_products",
		"billing_product_versions",
		"billing_orders",
		"workspace_storage_boosters",
		"pricing_email_batches",
		"billing_lifecycle_policies",
		"billing_lifecycle_jobs",
		"billing_notification_proofs",
	} {
		assert.Contains(t, normalized, "CREATE TABLE IF NOT EXISTS "+table,
			"up must create %s", table)
	}
	for _, product := range []string{
		"event_upload_standard",
		"event_upload_wedding",
		"gallery_extend_30",
		"gallery_extend_90",
		"gallery_archive_forever",
		"storage_boost_50",
		"storage_boost_250",
		"storage_boost_1000",
	} {
		assert.Contains(t, content, "'"+product+"'", "seed must include %s", product)
	}
	assert.Contains(t, content, "ADD COLUMN IF NOT EXISTS catalog_snapshot JSONB",
		"orders/invoices/payments must support immutable snapshots")
	assert.Contains(t, normalized, "ADD COLUMN IF NOT EXISTS plan_version_id UUID REFERENCES subscription_plan_versions(id)",
		"legacy upgrade orders must link to plan versions")
	assert.Contains(t, content, "approval_comment",
		"approval workflow must capture super-admin comments")
	assert.Contains(t, content, "rejection_reason",
		"approval workflow must capture rejection reasons")
	for _, policy := range []string{
		"subscription_monthly_default",
		"subscription_annual_default",
		"pay_per_event_default",
		"storage_booster_default",
	} {
		assert.Contains(t, content, "'"+policy+"'", "seed must include lifecycle policy %s", policy)
	}
	assert.Contains(t, content, "gallery_delete_grace_days, account_delete_grace_days",
		"lifecycle policies must separate gallery deletion from account grace")
	assert.Contains(t, content, "body_sha256 TEXT NOT NULL",
		"email legal proof must store immutable body hash")
	assert.Contains(t, content, `"upload_credits":500`,
		"pay-per-event products must grant upload credits from catalog metadata")
	assert.Contains(t, content, "'storage_booster_expire'",
		"lifecycle jobs must support automatic storage booster expiry")
	assert.Contains(t, content, "'pricing_change_notice'",
		"published pricing changes must enqueue email-only user notices")
}

func TestM177_DownRemovesGovernanceProductBillingFoundation(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m177Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)

	for _, table := range []string{
		"pricing_email_batches",
		"billing_notification_proofs",
		"billing_lifecycle_jobs",
		"billing_lifecycle_policies",
		"workspace_storage_boosters",
		"billing_orders",
		"billing_product_versions",
		"billing_products",
		"pricing_audit_events",
		"pricing_change_requests",
	} {
		assert.Contains(t, content, "DROP TABLE IF EXISTS "+table,
			"down must drop %s", table)
	}
	assert.Contains(t, content, "DROP COLUMN IF EXISTS catalog_snapshot")
	assert.Contains(t, content, "DROP COLUMN IF EXISTS plan_version_id")
}
