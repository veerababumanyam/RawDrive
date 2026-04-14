//go:build integration
// +build integration

// Real Postgres apply/rollback coverage for M35 / F-014 migrations 091–094.
// The default file-string suite (m35_migrations_test.go) already locks the
// SQL contents at the byte level. This suite locks the *runtime* contract:
// migrations actually run, indexes/columns/constraints behave as documented,
// and rollbacks return the schema to a usable state.
//
// Each test starts from the assumption that 091–094 are already applied
// against TEST_DATABASE_URL (the migrator ran on startup). Tests roll the
// target migration down, observe the absent state, then re-apply up — and
// register a t.Cleanup that restores the final-applied state even on failure.

package migrations_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------- 091: streaming_retention_audit ----------

func TestM35_091_RetentionAudit_RealApply_RoundTrip(t *testing.T) {
	pool := connectTestDB(t)

	up := readMigration(t, "091_f014_retention_audit.up.sql")
	down := readMigration(t, "091_f014_retention_audit.down.sql")

	// Belt and braces: regardless of how this test exits, leave the schema
	// in the up state so other tests / the surrounding harness see what
	// they expect.
	t.Cleanup(func() { execSQL(t, pool, up) })

	// Start clean: drop, then apply.
	execSQL(t, pool, down)
	require.False(t, tableExists(t, pool, "streaming_retention_audit"),
		"down migration should drop streaming_retention_audit")

	execSQL(t, pool, up)
	require.True(t, tableExists(t, pool, "streaming_retention_audit"))
	require.True(t,
		indexExists(t, pool, "streaming_retention_audit", "idx_streaming_retention_audit_job_ran"),
		"composite (job_name, ran_at DESC) index must exist")

	// Each CHECK-allowed job_name value must insert cleanly.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for _, job := range []string{"chat", "viewer_sessions", "replays"} {
		_, err := pool.Exec(ctx,
			`INSERT INTO streaming_retention_audit (job_name, cutoff_date, row_count, dry_run)
			 VALUES ($1, NOW() - INTERVAL '30 days', 0, true)`, job)
		require.NoError(t, err, "valid job_name %q must be accepted", job)
	}

	// Invalid job_name must be rejected by the CHECK constraint.
	_, err := pool.Exec(ctx,
		`INSERT INTO streaming_retention_audit (job_name, cutoff_date)
		 VALUES ('not_a_real_job', NOW())`)
	require.Error(t, err, "invalid job_name must violate CHECK constraint")

	// Negative row_count must also be rejected (CHECK row_count >= 0).
	_, err = pool.Exec(ctx,
		`INSERT INTO streaming_retention_audit (job_name, cutoff_date, row_count)
		 VALUES ('chat', NOW(), -1)`)
	require.Error(t, err, "negative row_count must violate CHECK constraint")

	// Idempotent re-apply (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
	execSQL(t, pool, up)
	require.True(t, tableExists(t, pool, "streaming_retention_audit"))

	// Clean rows we inserted so we don't pollute the shared DB.
	execSQL(t, pool,
		`DELETE FROM streaming_retention_audit WHERE dry_run = true AND row_count = 0`)
}

// ---------- 092: stream_chats archive + drop ----------

func TestM35_092_StreamChatsArchive_WithOrphanRow(t *testing.T) {
	pool := connectTestDB(t)

	up091 := readMigration(t, "091_f014_retention_audit.up.sql")
	down092 := readMigration(t, "092_f014_stream_chats_archive_and_drop.down.sql")
	up092 := readMigration(t, "092_f014_stream_chats_archive_and_drop.up.sql")

	// Always restore final state.
	t.Cleanup(func() {
		execSQL(t, pool, up092)
		execSQL(t, pool, up091)
	})

	// Recreate stream_chats so we can seed legacy rows. The down migration
	// is schema-only, which is exactly what we want here.
	execSQL(t, pool, down092)
	require.True(t, tableExists(t, pool, "stream_chats"),
		"092 down must restore stream_chats schema")

	// Seed: one workspace, one user, one stream — then two stream_chats rows.
	// One row also exists in chat_messages (already migrated); the other does
	// not (orphan). Only the orphan should be archived by 092 up.
	wsID := uuid.New()
	userID := uuid.New()
	streamID := uuid.New()
	matchedID := uuid.New() // present in both stream_chats AND chat_messages
	orphanID := uuid.New()  // present only in stream_chats

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(ctx) }()

	// Bypass RLS for the seed inserts. Several streaming tables FORCE RLS,
	// so even the table owner needs the bypass GUC set.
	_, err = tx.Exec(ctx, `SET LOCAL app.bypass_rls = 'on'`)
	require.NoError(t, err)

	// Users row first — workspaces.owner_id and streams.created_by both FK
	// to users(id), so we need a real user before we can seed either.
	_, err = tx.Exec(ctx,
		`INSERT INTO users (id, email, password_hash, email_verified)
		 VALUES ($1, 'm35-int-' || $1::text || '@example.test', 'x', true)`,
		userID)
	require.NoError(t, err, "seeding user")

	_, err = tx.Exec(ctx,
		`INSERT INTO workspaces (id, name, owner_id)
		 VALUES ($1, 'm35-int-ws', $2)`,
		wsID, userID)
	require.NoError(t, err, "seeding workspace")

	_, err = tx.Exec(ctx,
		`INSERT INTO streams (id, workspace_id, created_by, title, status)
		 VALUES ($1, $2, $3, 'm35-int-stream', 'ended')`,
		streamID, wsID, userID)
	require.NoError(t, err, "seeding stream")

	// Matched row: insert into BOTH tables with the same id so the
	// LEFT JOIN ... WHERE cm.id IS NULL filter excludes it.
	_, err = tx.Exec(ctx,
		`INSERT INTO chat_messages (id, stream_id, workspace_id, body, posted_at)
		 VALUES ($1, $2, $3, 'already-migrated', NOW())`,
		matchedID, streamID, wsID)
	require.NoError(t, err)
	_, err = tx.Exec(ctx,
		`INSERT INTO stream_chats (id, stream_id, user_name, user_id, message)
		 VALUES ($1, $2, 'tester', $3, 'already-migrated')`,
		matchedID, streamID, userID)
	require.NoError(t, err)

	// Orphan row: only in stream_chats.
	_, err = tx.Exec(ctx,
		`INSERT INTO stream_chats (id, stream_id, user_name, user_id, message)
		 VALUES ($1, $2, 'tester', $3, 'orphan-needs-archive')`,
		orphanID, streamID, userID)
	require.NoError(t, err)

	require.NoError(t, tx.Commit(ctx))

	// Snapshot count BEFORE applying up.
	beforeCount := scalarInt(t, pool,
		`SELECT COUNT(*) FROM chat_messages WHERE stream_id = $1`, streamID)
	require.Equal(t, 1, beforeCount, "exactly one chat_messages row before archive")

	// Apply 092 up — orphan is archived, stream_chats dropped.
	execSQL(t, pool, up092)

	require.False(t, tableExists(t, pool, "stream_chats"),
		"092 up must drop stream_chats")

	afterCount := scalarInt(t, pool,
		`SELECT COUNT(*) FROM chat_messages WHERE stream_id = $1`, streamID)
	assert.Equal(t, beforeCount+1, afterCount,
		"chat_messages should grow by exactly one (the orphan)")

	// Verify the orphan id specifically landed.
	orphanLanded := scalarInt(t, pool,
		`SELECT COUNT(*) FROM chat_messages WHERE id = $1`, orphanID)
	assert.Equal(t, 1, orphanLanded, "orphan row must be present in chat_messages by id")

	// Cleanup our seed rows from chat_messages.
	cleanupCtx, ccancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer ccancel()
	_, _ = pool.Exec(cleanupCtx,
		`DELETE FROM chat_messages WHERE stream_id = $1`, streamID)
	_, _ = pool.Exec(cleanupCtx,
		`DELETE FROM streams WHERE id = $1`, streamID)
	_, _ = pool.Exec(cleanupCtx,
		`DELETE FROM workspaces WHERE id = $1`, wsID)
	_, _ = pool.Exec(cleanupCtx,
		`DELETE FROM users WHERE id = $1`, userID)

	// Documented behaviour note: running 092 down after this restores the
	// stream_chats table SCHEMA but not the row data. Asserting that
	// invariant explicitly so future schema changes can't silently start
	// re-restoring data without updating this contract.
	execSQL(t, pool, down092)
	require.True(t, tableExists(t, pool, "stream_chats"))
	rebornCount := scalarInt(t, pool, `SELECT COUNT(*) FROM stream_chats`)
	assert.Equal(t, 0, rebornCount, "092 down restores schema only — data is NOT recovered")
}

// ---------- 093: streams.pin_code drop ----------

func TestM35_093_PinCodeDrop_RealApply(t *testing.T) {
	pool := connectTestDB(t)

	up := readMigration(t, "093_f014_streams_pin_code_drop.up.sql")
	down := readMigration(t, "093_f014_streams_pin_code_drop.down.sql")

	// Restore final (column dropped) state on exit.
	t.Cleanup(func() { execSQL(t, pool, up) })

	// Currently dropped (post-migrate). Bring it back via down.
	execSQL(t, pool, down)
	require.True(t, columnExists(t, pool, "streams", "pin_code"),
		"093 down must add pin_code column back")

	// Apply up — column should disappear.
	execSQL(t, pool, up)
	require.False(t, columnExists(t, pool, "streams", "pin_code"),
		"093 up must drop pin_code")

	// Re-applying down restores schema (data NOT restored — column added empty).
	execSQL(t, pool, down)
	require.True(t, columnExists(t, pool, "streams", "pin_code"))
}

// ---------- 094: streaming.commercial_v1 flag seed ----------

func TestM35_094_FlagSeed_Upsert(t *testing.T) {
	pool := connectTestDB(t)

	up := readMigration(t, "094_f014_streaming_commercial_v1_flag_seed.up.sql")
	down := readMigration(t, "094_f014_streaming_commercial_v1_flag_seed.down.sql")

	// Restore final (seed present) state on exit.
	t.Cleanup(func() { execSQL(t, pool, up) })

	// Whatever state we start in, normalize to "absent" via down.
	execSQL(t, pool, down)
	count := scalarInt(t, pool,
		`SELECT COUNT(*) FROM platform_settings
		  WHERE category = 'featureflag' AND key = 'streaming.commercial_v1'`)
	require.Equal(t, 0, count, "094 down should remove the seed row")

	// Apply up — row should appear exactly once.
	execSQL(t, pool, up)
	count = scalarInt(t, pool,
		`SELECT COUNT(*) FROM platform_settings
		  WHERE category = 'featureflag' AND key = 'streaming.commercial_v1'`)
	require.Equal(t, 1, count, "094 up must insert the seed row")

	// Idempotent re-apply via ON CONFLICT DO NOTHING.
	execSQL(t, pool, up)
	count = scalarInt(t, pool,
		`SELECT COUNT(*) FROM platform_settings
		  WHERE category = 'featureflag' AND key = 'streaming.commercial_v1'`)
	require.Equal(t, 1, count, "094 up must remain idempotent (no duplicate row)")

	// Verify default value is the documented 'false'. Use a typed scan via
	// pgxpool — read as string regardless of the underlying column type
	// (TEXT / JSONB both stringify cleanly here).
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var value string
	err := pool.QueryRow(ctx,
		`SELECT value::text FROM platform_settings
		  WHERE category = 'featureflag' AND key = 'streaming.commercial_v1'`).
		Scan(&value)
	require.NoError(t, err)
	assert.Contains(t, value, "false",
		"seed default must be 'false' so the surface stays dark until flipped")

	// Down again to confirm explicit removal behaviour matches doc.
	execSQL(t, pool, down)
	count = scalarInt(t, pool,
		`SELECT COUNT(*) FROM platform_settings
		  WHERE category = 'featureflag' AND key = 'streaming.commercial_v1'`)
	assert.Equal(t, 0, count, "094 down explicitly removes the seed row")
}

// guard against unused-import in case the file is trimmed later.
var _ = pgxpool.Config{}
