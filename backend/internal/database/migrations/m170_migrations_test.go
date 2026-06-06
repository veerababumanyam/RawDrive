package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m170Base = "170_refine_event_pricing_details"

func TestM170_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m170Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM170_UpRefinesEventPricingDetails(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m170Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := strings.Join(strings.Fields(content), " ")

	assert.Contains(t, content, "BEGIN", "up must be transactional")
	assert.Contains(t, content, "COMMIT", "up must commit")
	assert.Contains(t, normalized, "WHERE tier = 'pay_per_event'",
		"up must update the Pay Per Event catalog row")
	for _, detail := range []string{
		"Rs.199 Event Upload",
		"30-day Active Phase",
		"View-only After Active Phase",
		"Auto-archive After 90 Days",
		"Rs.499 Wedding Upload (60-day Active Phase)",
		"Extension Packs Available",
	} {
		assert.Contains(t, content, detail, "up must persist %q", detail)
	}
	assert.Contains(t, content, "Reel & Shorts Gallery",
		"up must align Creator feature wording")
}

func TestM170_DownRestoresPreviousEventPricingDetails(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m170Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)

	for _, detail := range []string{
		"7-day Upload Window",
		"30-day Client Access",
		"90-day Storage Retention",
		"Wedding Bundle Available",
		"Extend or Archive Anytime",
		"Reels & Shorts Gallery",
	} {
		assert.Contains(t, content, detail, "down must restore %q", detail)
	}
}
