package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// M39 Round 1 — foundation migration:
//   095_add_dealer_deleted_at — soft-delete column + partial index on dealers
//
// Mirrors the M35/M34 file-content contract pattern. No DB required.

type m39Migration struct {
	Number          string
	Description     string
	UpMustContain   []string
	DownMustContain []string
}

var m39Migrations = []m39Migration{
	{
		Number:      "095",
		Description: "add_dealer_deleted_at",
		UpMustContain: []string{
			"ALTER TABLE",
			"dealers",
			"ADD COLUMN IF NOT EXISTS",
			"deleted_at",
			"TIMESTAMPTZ",
			"CREATE INDEX IF NOT EXISTS",
			"idx_dealers_deleted_at",
			"WHERE deleted_at IS NULL",
		},
		DownMustContain: []string{
			"DROP INDEX IF EXISTS",
			"idx_dealers_deleted_at",
			"ALTER TABLE",
			"dealers",
			"DROP COLUMN IF EXISTS",
			"deleted_at",
		},
	},
}

func TestM39_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, m := range m39Migrations {
		upPath := filepath.Join(dir, m.Number+"_"+m.Description+".up.sql")
		downPath := filepath.Join(dir, m.Number+"_"+m.Description+".down.sql")
		_, err := os.Stat(upPath)
		assert.NoError(t, err, "migration %s up.sql must exist", m.Number)
		_, err = os.Stat(downPath)
		assert.NoError(t, err, "migration %s down.sql must exist", m.Number)
	}
}

func TestM39_095_AddsDealerDeletedAtColumn(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "095_add_dealer_deleted_at.up.sql"))
	require.NoError(t, err)
	sql := string(content)

	for _, substr := range m39Migrations[0].UpMustContain {
		assert.Contains(t, sql, substr,
			"095 up must contain %q (soft-delete column + partial index)", substr)
	}

	// Safety: must be idempotent — column and index both use IF NOT EXISTS
	assert.Contains(t, strings.ToUpper(sql), "IF NOT EXISTS",
		"095 up must use IF NOT EXISTS for idempotency")
}

func TestM39_095_PartialIndexCoversActiveRows(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "095_add_dealer_deleted_at.up.sql"))
	require.NoError(t, err)
	sql := string(content)

	// The partial index WHERE clause is the whole point — it keeps List queries
	// (which exclude deleted rows) fast without bloating the index with tombstones.
	assert.Contains(t, sql, "WHERE deleted_at IS NULL",
		"095 partial index must target active rows only (WHERE deleted_at IS NULL)")
}

func TestM39_095_DownReversesColumnAndIndex(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "095_add_dealer_deleted_at.down.sql"))
	require.NoError(t, err)
	sql := string(content)

	for _, substr := range m39Migrations[0].DownMustContain {
		assert.Contains(t, sql, substr,
			"095 down must contain %q (reverse partial index + column)", substr)
	}

	// Down ordering: DROP INDEX before DROP COLUMN (index references column).
	idxPos := strings.Index(sql, "DROP INDEX")
	colPos := strings.Index(sql, "DROP COLUMN")
	require.GreaterOrEqual(t, idxPos, 0, "095 down must include DROP INDEX")
	require.GreaterOrEqual(t, colPos, 0, "095 down must include DROP COLUMN")
	assert.Less(t, idxPos, colPos,
		"095 down must DROP INDEX before DROP COLUMN")
}
