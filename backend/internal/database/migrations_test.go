package database_test

import (
	"context"
	"fmt"
	"net/url"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/database"
)

const testDSN = "postgres://rawdrive_user:e706fbd6b28d036aa80379447729737b@localhost:55070/rawdrive_db?sslmode=disable"

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), testDSN)
	require.NoError(t, err, "failed to connect to test database")
	t.Cleanup(func() { pool.Close() })
	return pool
}

func tempDatabaseDSN(t *testing.T) string {
	t.Helper()

	adminDSN, err := withDatabaseName(testDSN, "postgres")
	require.NoError(t, err, "failed to build admin DSN")

	adminPool, err := pgxpool.New(context.Background(), adminDSN)
	require.NoError(t, err, "failed to connect to postgres admin database")

	dbName := fmt.Sprintf("rawdrive_test_%d", time.Now().UnixNano())
	_, err = adminPool.Exec(context.Background(), fmt.Sprintf(`CREATE DATABASE "%s"`, dbName))
	require.NoError(t, err, "failed to create isolated test database")

	t.Cleanup(func() {
		_, _ = adminPool.Exec(context.Background(),
			`SELECT pg_terminate_backend(pid)
			 FROM pg_stat_activity
			 WHERE datname = $1 AND pid <> pg_backend_pid()`,
			dbName,
		)
		_, _ = adminPool.Exec(context.Background(), fmt.Sprintf(`DROP DATABASE IF EXISTS "%s"`, dbName))
		adminPool.Close()
	})

	tempDSN, err := withDatabaseName(testDSN, dbName)
	require.NoError(t, err, "failed to build isolated test DSN")
	return tempDSN
}

func withDatabaseName(dsn, dbName string) (string, error) {
	parsed, err := url.Parse(dsn)
	if err != nil {
		return "", fmt.Errorf("parse dsn: %w", err)
	}
	parsed.Path = "/" + dbName
	return parsed.String(), nil
}

func TestMigrationsUp(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	err := migrator.Up()
	require.NoError(t, err, "all migrations should apply without error")
}

func TestMigrationsDown(t *testing.T) {
	migrator := database.NewMigrator(tempDatabaseDSN(t))

	// First apply all migrations
	err := migrator.Up()
	require.NoError(t, err, "migrations up should succeed before testing down")

	// Then rollback all migrations
	err = migrator.Down()
	require.NoError(t, err, "all migrations should rollback without error")
}

func TestUsersTableExists(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	// Verify users table exists
	var tableName string
	err := pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'users'`).Scan(&tableName)
	require.NoError(t, err, "users table should exist")
	assert.Equal(t, "users", tableName)

	// Verify expected columns exist
	expectedColumns := []string{"id", "email", "phone", "state_id", "created_at", "updated_at"}
	for _, col := range expectedColumns {
		var colName string
		err := pool.QueryRow(ctx,
			`SELECT column_name FROM information_schema.columns
			 WHERE table_schema = 'public' AND table_name = 'users' AND column_name = $1`, col).Scan(&colName)
		require.NoError(t, err, fmt.Sprintf("users table should have column %q", col))
		assert.Equal(t, col, colName)
	}
}

func TestStatesTableExists(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	// Verify states table exists
	var tableName string
	err := pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'states'`).Scan(&tableName)
	require.NoError(t, err, "states table should exist")
	assert.Equal(t, "states", tableName)

	// Verify 36 rows: 28 states + 8 UTs
	var count int
	err = pool.QueryRow(ctx, `SELECT COUNT(*) FROM states`).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 36, count, "states table should have 36 rows (28 states + 8 UTs)")
}

func TestWorkspacesTableExists(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	// Verify workspaces table exists
	var tableName string
	err := pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'workspaces'`).Scan(&tableName)
	require.NoError(t, err, "workspaces table should exist")
	assert.Equal(t, "workspaces", tableName)

	// Verify state_id FK constraint exists
	var fkCount int
	err = pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM information_schema.table_constraints tc
		 JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
		 WHERE tc.table_name = 'workspaces'
		   AND tc.constraint_type = 'FOREIGN KEY'
		   AND kcu.column_name = 'state_id'`).Scan(&fkCount)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, fkCount, 1, "workspaces should have a FK on state_id")
}

func TestSessionsTableExists(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	// Verify sessions table exists
	var sessTable string
	err := pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'sessions'`).Scan(&sessTable)
	require.NoError(t, err, "sessions table should exist")
	assert.Equal(t, "sessions", sessTable)

	// Verify refresh_tokens table exists
	var rtTable string
	err = pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'refresh_tokens'`).Scan(&rtTable)
	require.NoError(t, err, "refresh_tokens table should exist")
	assert.Equal(t, "refresh_tokens", rtTable)
}

func TestRolesTableExists(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	// Verify roles table exists
	var rolesTable string
	err := pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'roles'`).Scan(&rolesTable)
	require.NoError(t, err, "roles table should exist")
	assert.Equal(t, "roles", rolesTable)

	// Verify workspace_members table exists
	var wmTable string
	err = pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'workspace_members'`).Scan(&wmTable)
	require.NoError(t, err, "workspace_members table should exist")
	assert.Equal(t, "workspace_members", wmTable)
}

func TestRLSEnabled(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	// Tenant-scoped tables that must have RLS enabled
	tenantTables := []string{"workspaces", "workspace_members", "galleries"}

	for _, table := range tenantTables {
		var rlsEnabled bool
		err := pool.QueryRow(ctx,
			`SELECT relrowsecurity FROM pg_class WHERE relname = $1`, table).Scan(&rlsEnabled)
		require.NoError(t, err, fmt.Sprintf("should be able to check RLS on %s", table))
		assert.True(t, rlsEnabled, fmt.Sprintf("RLS should be enabled on %s", table))
	}
}

// === M4: Business Operations Tables ===

func TestLeadsTableExists(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	var tableName string
	err := pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'leads'`).Scan(&tableName)
	require.NoError(t, err, "leads table should exist")
	assert.Equal(t, "leads", tableName)

	expectedColumns := []string{"id", "workspace_id", "name", "phone", "email", "source", "stage", "event_type", "event_date", "budget_paisa", "assigned_to", "notes", "created_at", "updated_at"}
	for _, col := range expectedColumns {
		var colName string
		err := pool.QueryRow(ctx,
			`SELECT column_name FROM information_schema.columns
			 WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = $1`, col).Scan(&colName)
		require.NoError(t, err, fmt.Sprintf("leads table should have column %q", col))
		assert.Equal(t, col, colName)
	}
}

func TestContactsTableExists(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	var tableName string
	err := pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'contacts'`).Scan(&tableName)
	require.NoError(t, err, "contacts table should exist")
	assert.Equal(t, "contacts", tableName)

	expectedColumns := []string{"id", "workspace_id", "name", "phone", "email", "contact_type", "company", "address", "tags", "notes", "total_revenue_paisa", "created_at", "updated_at"}
	for _, col := range expectedColumns {
		var colName string
		err := pool.QueryRow(ctx,
			`SELECT column_name FROM information_schema.columns
			 WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = $1`, col).Scan(&colName)
		require.NoError(t, err, fmt.Sprintf("contacts table should have column %q", col))
		assert.Equal(t, col, colName)
	}
}

func TestDealsTableExists(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	var tableName string
	err := pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'deals'`).Scan(&tableName)
	require.NoError(t, err, "deals table should exist")
	assert.Equal(t, "deals", tableName)

	expectedColumns := []string{"id", "workspace_id", "contact_id", "title", "stage", "amount_paisa", "event_type", "event_date", "venue", "notes", "created_at", "updated_at"}
	for _, col := range expectedColumns {
		var colName string
		err := pool.QueryRow(ctx,
			`SELECT column_name FROM information_schema.columns
			 WHERE table_schema = 'public' AND table_name = 'deals' AND column_name = $1`, col).Scan(&colName)
		require.NoError(t, err, fmt.Sprintf("deals table should have column %q", col))
		assert.Equal(t, col, colName)
	}
}

func TestFollowUpsTableExists(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	var tableName string
	err := pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'follow_ups'`).Scan(&tableName)
	require.NoError(t, err, "follow_ups table should exist")
	assert.Equal(t, "follow_ups", tableName)
}

func TestInvoicesTableExists(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	var tableName string
	err := pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'invoices'`).Scan(&tableName)
	require.NoError(t, err, "invoices table should exist")
	assert.Equal(t, "invoices", tableName)

	// Verify GST-specific columns
	gstColumns := []string{"state_id", "cgst_paisa", "sgst_paisa", "igst_paisa", "subtotal_paisa", "total_paisa", "invoice_number", "invoice_type", "line_items"}
	for _, col := range gstColumns {
		var colName string
		err := pool.QueryRow(ctx,
			`SELECT column_name FROM information_schema.columns
			 WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = $1`, col).Scan(&colName)
		require.NoError(t, err, fmt.Sprintf("invoices table should have GST column %q", col))
		assert.Equal(t, col, colName)
	}
}

func TestContractsTableExists(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	var tableName string
	err := pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'contracts'`).Scan(&tableName)
	require.NoError(t, err, "contracts table should exist")
	assert.Equal(t, "contracts", tableName)

	expectedColumns := []string{"id", "workspace_id", "contact_id", "title", "status", "content_html", "signature_data", "signed_at", "signer_ip"}
	for _, col := range expectedColumns {
		var colName string
		err := pool.QueryRow(ctx,
			`SELECT column_name FROM information_schema.columns
			 WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = $1`, col).Scan(&colName)
		require.NoError(t, err, fmt.Sprintf("contracts table should have column %q", col))
		assert.Equal(t, col, colName)
	}
}

func TestContractTemplatesTableExists(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	var tableName string
	err := pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'contract_templates'`).Scan(&tableName)
	require.NoError(t, err, "contract_templates table should exist")
	assert.Equal(t, "contract_templates", tableName)
}

func TestEventsTableExists(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	var tableName string
	err := pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'events'`).Scan(&tableName)
	require.NoError(t, err, "events table should exist")
	assert.Equal(t, "events", tableName)

	expectedColumns := []string{"id", "workspace_id", "title", "event_type", "start_at", "end_at", "all_day", "location", "contact_id", "status", "recurrence_rule", "buffer_before_min", "buffer_after_min"}
	for _, col := range expectedColumns {
		var colName string
		err := pool.QueryRow(ctx,
			`SELECT column_name FROM information_schema.columns
			 WHERE table_schema = 'public' AND table_name = 'events' AND column_name = $1`, col).Scan(&colName)
		require.NoError(t, err, fmt.Sprintf("events table should have column %q", col))
		assert.Equal(t, col, colName)
	}
}

func TestNotificationsTableExists(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	var tableName string
	err := pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'notifications'`).Scan(&tableName)
	require.NoError(t, err, "notifications table should exist")
	assert.Equal(t, "notifications", tableName)

	expectedColumns := []string{"id", "user_id", "workspace_id", "notification_type", "title", "body", "channel", "is_read", "created_at"}
	for _, col := range expectedColumns {
		var colName string
		err := pool.QueryRow(ctx,
			`SELECT column_name FROM information_schema.columns
			 WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = $1`, col).Scan(&colName)
		require.NoError(t, err, fmt.Sprintf("notifications table should have column %q", col))
		assert.Equal(t, col, colName)
	}
}

func TestPaymentsTableExists(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	var tableName string
	err := pool.QueryRow(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'payments'`).Scan(&tableName)
	require.NoError(t, err, "payments table should exist")
	assert.Equal(t, "payments", tableName)
}

func TestM4RLSEnabled(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	m4Tables := []string{"leads", "contacts", "deals", "follow_ups", "invoices", "contracts", "contract_templates", "events", "payments"}
	for _, table := range m4Tables {
		var rlsEnabled bool
		err := pool.QueryRow(ctx,
			`SELECT relrowsecurity FROM pg_class WHERE relname = $1`, table).Scan(&rlsEnabled)
		require.NoError(t, err, fmt.Sprintf("should be able to check RLS on %s", table))
		assert.True(t, rlsEnabled, fmt.Sprintf("RLS should be enabled on %s", table))
	}
}

// === M7.5: Platform Role Schema ===

func TestMigration035_PlatformRoleColumnExists(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	var colName string
	err := pool.QueryRow(ctx,
		`SELECT column_name FROM information_schema.columns
		 WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'platform_role'`).Scan(&colName)
	require.NoError(t, err, "users table should have platform_role column")
	assert.Equal(t, "platform_role", colName)
}

func TestMigration035_PlatformRoleDefault(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	var colDefault string
	err := pool.QueryRow(ctx,
		`SELECT column_default FROM information_schema.columns
		 WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'platform_role'`).Scan(&colDefault)
	require.NoError(t, err, "platform_role should have a default")
	assert.Contains(t, colDefault, "photographer", "default should be 'photographer'")
}

func TestMigration035_PlatformRoleCheckConstraint(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	// Verify the CHECK constraint exists
	var constraintName string
	err := pool.QueryRow(ctx,
		`SELECT constraint_name FROM information_schema.table_constraints
		 WHERE table_name = 'users' AND constraint_type = 'CHECK'
		 AND constraint_name = 'users_platform_role_check'`).Scan(&constraintName)
	require.NoError(t, err, "CHECK constraint users_platform_role_check should exist")
	assert.Equal(t, "users_platform_role_check", constraintName)

	// Verify invalid role is rejected
	_, err = pool.Exec(ctx,
		`INSERT INTO users (email, platform_role) VALUES ('constraint-test@rawdrive.test', 'invalid_role')`)
	assert.Error(t, err, "invalid platform_role should be rejected by CHECK constraint")
}

func TestMigration035_PlatformRoleIndex(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	var indexName string
	err := pool.QueryRow(ctx,
		`SELECT indexname FROM pg_indexes
		 WHERE tablename = 'users' AND indexname = 'idx_users_platform_role'`).Scan(&indexName)
	require.NoError(t, err, "idx_users_platform_role index should exist")
	assert.Equal(t, "idx_users_platform_role", indexName)
}

func TestMigration036_TestUsersSeeded(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	tests := []struct {
		email        string
		platformRole string
		displayName  string
	}{
		{"superadmin@rawdrive.test", "super_admin", "Super Admin"},
		{"admin@rawdrive.test", "admin", "Platform Admin"},
		{"dealer@rawdrive.test", "dealer", "Test Dealer"},
	}

	for _, tt := range tests {
		t.Run(tt.email, func(t *testing.T) {
			var role, name string
			var verified bool
			err := pool.QueryRow(ctx,
				`SELECT platform_role, display_name, email_verified FROM users WHERE email = $1`,
				tt.email).Scan(&role, &name, &verified)
			require.NoError(t, err, "seeded user %s should exist", tt.email)
			assert.Equal(t, tt.platformRole, role)
			assert.Equal(t, tt.displayName, name)
			assert.True(t, verified, "seeded user should be email_verified")
		})
	}
}

func TestMigration036_TestUsersHaveWorkspaces(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	testEmails := []string{
		"superadmin@rawdrive.test",
		"admin@rawdrive.test",
		"dealer@rawdrive.test",
	}

	for _, email := range testEmails {
		t.Run(email, func(t *testing.T) {
			var wsCount int
			err := pool.QueryRow(ctx,
				`SELECT COUNT(*) FROM workspace_members wm
				 JOIN users u ON u.id = wm.user_id
				 WHERE u.email = $1`, email).Scan(&wsCount)
			require.NoError(t, err)
			assert.GreaterOrEqual(t, wsCount, 1, "user %s should have at least 1 workspace membership", email)
		})
	}
}

func TestMigration036_DealerRecordExists(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	var status string
	err := pool.QueryRow(ctx,
		`SELECT d.status FROM dealers d
		 JOIN users u ON u.id = d.user_id
		 WHERE u.email = 'dealer@rawdrive.test'`).Scan(&status)
	require.NoError(t, err, "dealer record should exist for test dealer user")
	assert.Equal(t, "approved", status)
}

func TestMigration036_SeedIdempotent(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	// Running Up twice should not error (idempotent seeds)
	require.NoError(t, migrator.Up())
	// The second call is a no-op since all migrations are already applied
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	// Verify our 3 seeded users exist with correct platform roles
	var count int
	err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM users WHERE email IN ('superadmin@rawdrive.test', 'admin@rawdrive.test', 'dealer@rawdrive.test')`).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 3, count, "should have exactly 3 seeded role test users")
}

func TestMigration035_ValidPlatformRoles(t *testing.T) {
	migrator := database.NewMigrator(testDSN)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	validRoles := []string{"super_admin", "admin", "dealer", "photographer", "team_member", "client"}
	for _, role := range validRoles {
		email := fmt.Sprintf("role-test-%s@rawdrive.test", role)
		_, err := pool.Exec(ctx,
			`INSERT INTO users (email, platform_role) VALUES ($1, $2)
			 ON CONFLICT (email) DO NOTHING`, email, role)
		assert.NoError(t, err, "platform_role '%s' should be accepted", role)
	}

	// Cleanup test data
	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE email LIKE 'role-test-%@rawdrive.test'`)
}
