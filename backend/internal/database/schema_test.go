package database_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupSchemaTest(t *testing.T) *pgxpool.Pool {
	t.Helper()
	migrator := newMigrator(t)
	require.NoError(t, migrator.Up())
	return testPool(t)
}

func TestUsersEmailUnique(t *testing.T) {
	pool := setupSchemaTest(t)
	ctx := context.Background()

	// Insert a user with a known email
	_, err := pool.Exec(ctx,
		`INSERT INTO users (email, phone, state_id) VALUES ('dup@test.com', '+919000000001', 1)`)
	require.NoError(t, err, "first insert should succeed")

	// Attempt duplicate email — should fail with unique constraint violation
	_, err = pool.Exec(ctx,
		`INSERT INTO users (email, phone, state_id) VALUES ('dup@test.com', '+919000000002', 1)`)
	require.Error(t, err, "duplicate email should be rejected")
	assert.Contains(t, err.Error(), "unique", "error should mention unique constraint")

	// Cleanup
	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE email = 'dup@test.com'`)
}

func TestUsersPhoneUnique(t *testing.T) {
	pool := setupSchemaTest(t)
	ctx := context.Background()

	// Phone-reuse epic (migration 173): the byte-exact global users_phone_key is
	// replaced by a partial unique index on phone_normalized scoped to FREE
	// accounts (users_phone_normalized_free_unique). Uniqueness is therefore on
	// the canonical identity AND state-aware. These raw inserts set
	// phone_normalized explicitly (in the app it is written through by the repo).

	// Two FREE accounts with the same normalized phone -> the second is rejected.
	_, err := pool.Exec(ctx,
		`INSERT INTO users (email, phone, phone_normalized, phone_reuse_state, state_id)
		 VALUES ('a@test.com', '+919111111111', '919111111111', 'free', 1)`)
	require.NoError(t, err, "first free insert should succeed")

	_, err = pool.Exec(ctx,
		`INSERT INTO users (email, phone, phone_normalized, phone_reuse_state, state_id)
		 VALUES ('b@test.com', '+919111111111', '919111111111', 'free', 1)`)
	require.Error(t, err, "a second FREE account on the same normalized phone must be rejected")
	assert.Contains(t, err.Error(), "unique", "error should mention unique constraint")

	// A PAID reuse account on the SAME normalized phone is allowed — it sits
	// outside the partial unique predicate (the rule is "one FREE per phone").
	_, err = pool.Exec(ctx,
		`INSERT INTO users (email, phone, phone_normalized, phone_reuse_state, state_id)
		 VALUES ('c@test.com', '+919111111111', '919111111111', 'paid_active', 1)`)
	require.NoError(t, err, "a paid_active account may reuse a normalized phone")

	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE phone_normalized = '919111111111'`)
}

func TestUserStateFK(t *testing.T) {
	pool := setupSchemaTest(t)
	ctx := context.Background()

	// state_id 9999 should not exist
	_, err := pool.Exec(ctx,
		`INSERT INTO users (email, phone, state_id) VALUES ('fk@test.com', '+919222222222', 9999)`)
	require.Error(t, err, "invalid state_id should be rejected by FK constraint")
	assert.Contains(t, err.Error(), "foreign key", "error should reference foreign key violation")
}

func TestWorkspaceStateFK(t *testing.T) {
	pool := setupSchemaTest(t)
	ctx := context.Background()

	_, err := pool.Exec(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id)
		 VALUES ('BadState Inc', 9999, '00000000-0000-0000-0000-000000000000')`)
	require.Error(t, err, "workspace with invalid state_id should be rejected")
	assert.Contains(t, err.Error(), "foreign key")
}

func TestWorkspaceMemberRoleFK(t *testing.T) {
	pool := setupSchemaTest(t)
	ctx := context.Background()

	_, err := pool.Exec(ctx,
		`INSERT INTO workspace_members (workspace_id, user_id, role_id)
		 VALUES ('00000000-0000-0000-0000-000000000001',
		         '00000000-0000-0000-0000-000000000002',
		         99999)`)
	require.Error(t, err, "workspace member with invalid role_id should be rejected")
	assert.Contains(t, err.Error(), "foreign key")
}

func TestOTPTokenExpiry(t *testing.T) {
	pool := setupSchemaTest(t)
	ctx := context.Background()

	var colName string
	err := pool.QueryRow(ctx,
		`SELECT column_name FROM information_schema.columns
		 WHERE table_name = 'otp_tokens' AND column_name = 'expires_at'`).Scan(&colName)
	require.NoError(t, err, "otp_tokens table should have expires_at column")
	assert.Equal(t, "expires_at", colName)
}

func TestRefreshTokenFamily(t *testing.T) {
	pool := setupSchemaTest(t)
	ctx := context.Background()

	var colName string
	err := pool.QueryRow(ctx,
		`SELECT column_name FROM information_schema.columns
		 WHERE table_name = 'refresh_tokens' AND column_name = 'family'`).Scan(&colName)
	require.NoError(t, err, "refresh_tokens table should have family column for rotation")
	assert.Equal(t, "family", colName)
}

func TestSessionConcurrentLimit(t *testing.T) {
	pool := setupSchemaTest(t)
	ctx := context.Background()

	// Verify sessions table supports querying by user_id for concurrent session limiting
	var colExists string
	err := pool.QueryRow(ctx,
		`SELECT column_name FROM information_schema.columns
		 WHERE table_name = 'sessions' AND column_name = 'user_id'`).Scan(&colExists)
	require.NoError(t, err, "sessions table should have user_id column for concurrent limit queries")
	assert.Equal(t, "user_id", colExists)

	// Verify created_at exists for ordering sessions
	err = pool.QueryRow(ctx,
		`SELECT column_name FROM information_schema.columns
		 WHERE table_name = 'sessions' AND column_name = 'created_at'`).Scan(&colExists)
	require.NoError(t, err, "sessions table should have created_at for ordering")
}

func TestGSTINFormat(t *testing.T) {
	pool := setupSchemaTest(t)
	ctx := context.Background()

	// Verify GSTIN column exists on workspaces table
	var colName string
	err := pool.QueryRow(ctx,
		`SELECT column_name FROM information_schema.columns
		 WHERE table_name = 'workspaces' AND column_name = 'gstin'`).Scan(&colName)
	require.NoError(t, err, "workspaces table should have gstin column")
	assert.Equal(t, "gstin", colName)
}

func TestProfileCompletionTracking(t *testing.T) {
	pool := setupSchemaTest(t)
	ctx := context.Background()

	var colName string
	err := pool.QueryRow(ctx,
		`SELECT column_name FROM information_schema.columns
		 WHERE table_name = 'users' AND column_name = 'onboarding_step'`).Scan(&colName)
	require.NoError(t, err, "users table should have onboarding_step column")
	assert.Equal(t, "onboarding_step", colName)
}

func TestMagicLinkTokenSingleUse(t *testing.T) {
	pool := setupSchemaTest(t)
	ctx := context.Background()

	var colName string
	err := pool.QueryRow(ctx,
		`SELECT column_name FROM information_schema.columns
		 WHERE table_name = 'magic_link_tokens' AND column_name = 'used_at'`).Scan(&colName)
	require.NoError(t, err, "magic_link_tokens table should have used_at column for single-use enforcement")
	assert.Equal(t, "used_at", colName)
}

func TestAuditLogImmutable(t *testing.T) {
	pool := setupSchemaTest(t)
	ctx := context.Background()

	// Verify audit_log table exists
	var tableName string
	err := pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'audit_log'`).Scan(&tableName)
	require.NoError(t, err, "audit_log table should exist")
	assert.Equal(t, "audit_log", tableName)

	// Verify there is a trigger or rule preventing UPDATE/DELETE on audit_log
	// Check for a trigger that enforces immutability
	var triggerCount int
	err = pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM information_schema.triggers
		 WHERE event_object_table = 'audit_log'
		   AND (action_statement LIKE '%RAISE%' OR action_statement LIKE '%prevent%')
		   AND (event_manipulation = 'UPDATE' OR event_manipulation = 'DELETE')`).Scan(&triggerCount)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, triggerCount, 1, "audit_log should have immutability trigger(s) preventing UPDATE/DELETE")
}
