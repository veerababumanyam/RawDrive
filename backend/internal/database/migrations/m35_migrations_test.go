package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// M35 Round 1 — foundation migrations:
//   091_f014_retention_audit
//   092_f014_stream_chats_archive_and_drop
//   093_f014_streams_pin_code_drop
//   094_f014_streaming_commercial_v1_flag_seed
//
// These tests assert schema invariants via file-content contracts, mirroring
// the M34 pattern in m34_migrations_test.go.

type m35Migration struct {
	Number          string
	Description     string
	UpMustContain   []string
	DownMustContain []string
}

var m35Migrations = []m35Migration{
	{
		Number:      "091",
		Description: "f014_retention_audit",
		UpMustContain: []string{
			"CREATE TABLE",
			"streaming_retention_audit",
			"job_name",
			"ran_at",
			"cutoff_date",
			"row_count",
			"dry_run",
			"details",
			"gen_random_uuid()",
			"DEFAULT NOW()",
			"CREATE INDEX",
			"job_name, ran_at DESC",
		},
		DownMustContain: []string{
			"DROP TABLE",
			"streaming_retention_audit",
			"IF EXISTS",
		},
	},
	{
		Number:      "092",
		Description: "f014_stream_chats_archive_and_drop",
		UpMustContain: []string{
			"stream_chats",
			"chat_messages",
			"INSERT INTO chat_messages",
			"DROP TABLE",
			"IF EXISTS",
		},
		DownMustContain: []string{
			"CREATE TABLE",
			"stream_chats",
			"IF NOT EXISTS",
			// data NOT restored note
			"data",
		},
	},
	{
		Number:      "093",
		Description: "f014_streams_pin_code_drop",
		UpMustContain: []string{
			"ALTER TABLE",
			"streams",
			"DROP COLUMN IF EXISTS",
			"pin_code",
		},
		DownMustContain: []string{
			"ALTER TABLE",
			"streams",
			"ADD COLUMN",
			"pin_code",
		},
	},
	{
		Number:      "094",
		Description: "f014_streaming_commercial_v1_flag_seed",
		UpMustContain: []string{
			"INSERT INTO platform_settings",
			"featureflag",
			"streaming.commercial_v1",
			"ON CONFLICT",
			"DO NOTHING",
		},
		DownMustContain: []string{
			"DELETE FROM platform_settings",
			"streaming.commercial_v1",
		},
	},
}

func TestM35_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)

	for _, m := range m35Migrations {
		upFile := m.Number + "_" + m.Description + ".up.sql"
		downFile := m.Number + "_" + m.Description + ".down.sql"

		t.Run(upFile, func(t *testing.T) {
			path := filepath.Join(dir, upFile)
			info, err := os.Stat(path)
			require.NoError(t, err, "M35 UP migration must exist: %s", upFile)
			assert.Greater(t, info.Size(), int64(0), "UP migration must not be empty")

			content, err := os.ReadFile(path)
			require.NoError(t, err)
			for _, token := range m.UpMustContain {
				assert.True(t,
					strings.Contains(string(content), token),
					"migration %s must contain %q", upFile, token)
			}
		})

		t.Run(downFile, func(t *testing.T) {
			path := filepath.Join(dir, downFile)
			info, err := os.Stat(path)
			require.NoError(t, err, "M35 DOWN migration must exist: %s", downFile)
			assert.Greater(t, info.Size(), int64(0), "DOWN migration must not be empty")

			content, err := os.ReadFile(path)
			require.NoError(t, err)
			for _, token := range m.DownMustContain {
				assert.True(t,
					strings.Contains(string(content), token),
					"migration %s must contain %q", downFile, token)
			}
		})
	}
}

// TestM35_091_CreatesRetentionAuditTable locks column + index contract
// so downstream retention-audit writers can rely on these names.
func TestM35_091_CreatesRetentionAuditTable(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "091_f014_retention_audit.up.sql"))
	require.NoError(t, err)
	sql := string(content)

	// Required columns
	for _, col := range []string{"id", "job_name", "ran_at", "cutoff_date", "row_count", "dry_run", "details"} {
		assert.Contains(t, sql, col, "retention audit table must declare column %q", col)
	}
	// job_name CHECK constraint covering all three jobs
	assert.Contains(t, sql, "chat")
	assert.Contains(t, sql, "viewer_sessions")
	assert.Contains(t, sql, "replays")
	// Index on (job_name, ran_at DESC)
	assert.Contains(t, sql, "job_name, ran_at DESC")
	// details is jsonb
	assert.Contains(t, strings.ToLower(sql), "jsonb")
}

func TestM35_091_DownReversible(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "091_f014_retention_audit.down.sql"))
	require.NoError(t, err)
	sql := string(content)
	assert.Contains(t, sql, "DROP TABLE IF EXISTS streaming_retention_audit",
		"091 down must drop streaming_retention_audit idempotently")
}

// TestM35_092_DropsStreamChatsIfExists asserts idempotent drop.
func TestM35_092_DropsStreamChatsIfExists(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "092_f014_stream_chats_archive_and_drop.up.sql"))
	require.NoError(t, err)
	sql := string(content)
	assert.Contains(t, sql, "DROP TABLE IF EXISTS stream_chats",
		"092 up must DROP TABLE IF EXISTS stream_chats for idempotency")
}

// TestM35_092_ArchivesOrphansToChatMessages asserts INSERT ... SELECT path exists
// so orphan rows that never migrated land in chat_messages before DROP.
func TestM35_092_ArchivesOrphansToChatMessages(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "092_f014_stream_chats_archive_and_drop.up.sql"))
	require.NoError(t, err)
	sql := strings.ToLower(string(content))

	assert.Contains(t, sql, "insert into chat_messages",
		"092 up must INSERT orphan stream_chats rows into chat_messages")
	assert.Contains(t, sql, "from stream_chats",
		"092 up must SELECT FROM stream_chats during archival")
	// LEFT JOIN or NOT EXISTS anti-join to skip already-migrated rows
	assert.True(t,
		strings.Contains(sql, "left join") || strings.Contains(sql, "not exists"),
		"092 up must use anti-join (LEFT JOIN or NOT EXISTS) to archive only orphans")
	// Guard against missing table on fresh DBs
	assert.Contains(t, sql, "to_regclass",
		"092 up must guard archival with to_regclass so it's idempotent on fresh DBs")
}

// TestM35_092_DownRecreatesSchema — schema only, data not restored.
func TestM35_092_DownRecreatesSchema(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "092_f014_stream_chats_archive_and_drop.down.sql"))
	require.NoError(t, err)
	sql := string(content)
	assert.Contains(t, sql, "CREATE TABLE IF NOT EXISTS stream_chats")
	// Must explicitly document data loss
	assert.Contains(t, strings.ToLower(sql), "data",
		"092 down must comment that data is NOT restored")
}

// TestM35_093_DropsPinCodeColumn asserts idempotent DROP COLUMN.
func TestM35_093_DropsPinCodeColumn(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "093_f014_streams_pin_code_drop.up.sql"))
	require.NoError(t, err)
	sql := string(content)
	assert.Contains(t, sql, "ALTER TABLE streams DROP COLUMN IF EXISTS pin_code",
		"093 up must drop streams.pin_code idempotently")
}

func TestM35_093_DownRestoresColumn(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "093_f014_streams_pin_code_drop.down.sql"))
	require.NoError(t, err)
	sql := string(content)
	assert.Contains(t, sql, "ALTER TABLE streams ADD COLUMN")
	assert.Contains(t, sql, "pin_code")
}

// TestM35_094_SeedsFeatureFlag asserts the streaming.commercial_v1 flag row
// is seeded idempotently into platform_settings.
func TestM35_094_SeedsFeatureFlag(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "094_f014_streaming_commercial_v1_flag_seed.up.sql"))
	require.NoError(t, err)
	sql := string(content)

	assert.Contains(t, sql, "INSERT INTO platform_settings")
	assert.Contains(t, sql, "'featureflag'")
	assert.Contains(t, sql, "'streaming.commercial_v1'")
	assert.Contains(t, sql, "ON CONFLICT")
	assert.Contains(t, sql, "DO NOTHING",
		"094 seed must be idempotent via ON CONFLICT DO NOTHING")
}
