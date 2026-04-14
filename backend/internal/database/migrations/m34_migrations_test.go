package migrations_test

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// M34 Round 1 RED — streaming_shortlinks + streaming_preflight_sessions migrations.
// These tests MUST fail before Round 1 GREEN creates the migration files.

var m34Migrations = []struct {
	Number      string
	Description string
	// Substrings that must appear in the UP SQL to lock schema invariants.
	UpMustContain []string
}{
	{
		Number:      "089",
		Description: "f014_streaming_shortlinks",
		UpMustContain: []string{
			"CREATE TABLE",
			"streaming_shortlinks",
			"shortcode",
			"UNIQUE",
			"streaming_shortlink_hits",
			"ip_hash",
			"src",
			"user_agent",
		},
	},
	{
		Number:      "090",
		Description: "f014_streaming_preflight_sessions",
		UpMustContain: []string{
			"CREATE TABLE",
			"streaming_preflight_sessions",
			"cf_input_id",
			"expires_at",
			"deleted",
			"stream_id",
		},
	},
}

func TestM34MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)

	for _, m := range m34Migrations {
		upFile := fmt.Sprintf("%s_%s.up.sql", m.Number, m.Description)
		downFile := fmt.Sprintf("%s_%s.down.sql", m.Number, m.Description)

		t.Run(upFile, func(t *testing.T) {
			path := filepath.Join(dir, upFile)
			info, err := os.Stat(path)
			require.NoError(t, err, "M34 UP migration must exist: %s", upFile)
			assert.Greater(t, info.Size(), int64(0), "UP migration must not be empty")

			content, err := os.ReadFile(path)
			require.NoError(t, err)
			for _, token := range m.UpMustContain {
				assert.True(t,
					strings.Contains(string(content), token),
					"migration %s must contain %q to lock schema contract",
					upFile, token)
			}
		})

		t.Run(downFile, func(t *testing.T) {
			path := filepath.Join(dir, downFile)
			info, err := os.Stat(path)
			require.NoError(t, err, "M34 DOWN migration must exist: %s", downFile)
			assert.Greater(t, info.Size(), int64(0), "DOWN migration must not be empty")
		})
	}
}

// Invariant: preflight migration MUST NOT reference streaming_ledger.
// Preflight writes ephemeral sessions only — any insert/alter on streaming_ledger
// from this migration breaks the core F-014 invariant (E109-C2 security rule).
func TestM34PreflightMigrationDoesNotTouchLedger(t *testing.T) {
	dir := migrationDir(t)
	upPath := filepath.Join(dir, "090_f014_streaming_preflight_sessions.up.sql")

	content, err := os.ReadFile(upPath)
	require.NoError(t, err, "090 preflight UP migration must exist")

	lower := strings.ToLower(string(content))
	assert.False(t,
		strings.Contains(lower, "streaming_ledger"),
		"preflight migration MUST NOT reference streaming_ledger — invariant violated")
}
