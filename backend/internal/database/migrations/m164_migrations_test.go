package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m164Base = "164_gallery_default_cover_backfill"

func TestM164_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m164Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM164_UpBackfillsMissingCoverFromFirstActiveGalleryAsset(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m164Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := strings.ToLower(content)

	assert.Contains(t, content, "BEGIN", "up must be wrapped in a transaction")
	assert.Contains(t, content, "COMMIT", "up must commit the transaction")
	assert.Contains(t, normalized, "update galleries g", "up must update galleries")
	assert.Contains(t, normalized, "current_cover.id = g.cover_asset_id",
		"up must detect existing cover references before deciding to backfill")
	assert.Contains(t, normalized, "current_cover.deleted_at is null",
		"up must preserve photographer-selected covers only when they still point to live assets")
	assert.Contains(t, normalized, "not exists",
		"up must fill missing or stale covers without overwriting valid photographer-selected covers")
	assert.Contains(t, normalized, "saved_cover_candidates",
		"up must prefer historical photographer-selected covers from settings")
	assert.Contains(t, normalized, "g.settings #>> '{design_config,cover,assetid}'",
		"up must read modern design_config cover choices")
	assert.Contains(t, normalized, "g.settings #>> '{cover_style,asset_id}'",
		"up must read legacy cover_style choices")
	assert.Contains(t, normalized, "cover_asset_id ~*",
		"up must validate saved cover UUIDs before casting")
	assert.Contains(t, normalized, "first_asset_candidates",
		"up must fall back to the first uploaded asset when no saved choice exists")
	assert.Contains(t, normalized, "row_number() over",
		"up must rank gallery assets instead of picking an arbitrary row")
	assert.Contains(t, normalized, "partition by gallery_id",
		"ranking must be per gallery")
	assert.Contains(t, normalized, "order by priority asc, sort_order asc, added_at asc, asset_id asc",
		"backfill must prefer saved choices, then pick the first uploaded/ordered active asset deterministically")
	assert.Contains(t, normalized, "a.deleted_at is null",
		"backfill must ignore soft-deleted assets")
	assert.Contains(t, normalized, "a.workspace_id = g.workspace_id",
		"backfill must keep the gallery/asset workspace boundary intact")
	assert.Contains(t, normalized, "g.deleted_at is null",
		"backfill must ignore deleted galleries")

	stripped := stripSQLComments(content)
	assert.NotContains(t, stripped, "DROP TABLE", "164 up must not drop tables")
	assert.NotContains(t, stripped, "DELETE FROM", "164 up must not delete data")
}

func TestM164_DownIsNoopToPreserveUserCoverChoices(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m164Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)
	stripped := strings.ToUpper(stripSQLComments(content))

	assert.Contains(t, content, "BEGIN", "down must be wrapped in a transaction")
	assert.Contains(t, content, "COMMIT", "down must commit the transaction")
	assert.NotContains(t, stripped, "UPDATE GALLERIES",
		"down must not clear backfilled covers because they may have been user-edited")
	assert.NotContains(t, stripped, "DELETE FROM", "down must not delete data")
	assert.NotContains(t, stripped, "ALTER TABLE", "down must not change schema")
	assert.NotContains(t, stripped, "DROP ", "down must not drop objects")
}
