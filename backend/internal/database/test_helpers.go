package database

import (
	"context"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testPoolInstance stores a reference to the pool for context helpers.
var testPoolInstance *pgxpool.Pool

func setTestPool(pool *pgxpool.Pool) {
	testPoolInstance = pool
}

// setOnAllConns sets session variables on all connections in the pool.
// Since the test user is a superuser (bypasses RLS), we use SET ROLE to switch
// to the non-superuser rawdrive_app role which respects RLS policies.
func setOnAllConns(ctx context.Context, pool *pgxpool.Pool, stmts []string) {
	var conns []*pgxpool.Conn
	stat := pool.Stat()
	maxConns := int(stat.MaxConns())
	if maxConns < 1 {
		maxConns = 4
	}

	for i := 0; i < maxConns; i++ {
		conn, err := pool.Acquire(ctx)
		if err != nil {
			break
		}
		conns = append(conns, conn)
	}

	for _, conn := range conns {
		for _, stmt := range stmts {
			_, _ = conn.Exec(ctx, stmt)
		}
	}

	for _, conn := range conns {
		conn.Release()
	}
}

// SeedTestWorkspace creates a test user and workspace, returning the workspace ID.
func SeedTestWorkspace(t *testing.T, pool *pgxpool.Pool, ctx context.Context, name string) string {
	t.Helper()
	setTestPool(pool)

	// Use superuser role for seeding (bypass RLS)
	setOnAllConns(ctx, pool, []string{
		"RESET ROLE",
		"SELECT set_config('app.bypass_rls', 'on', false)",
		"SELECT set_config('app.workspace_id', '', false)",
	})

	// Create a test user
	var userID string
	err := pool.QueryRow(ctx,
		`INSERT INTO users (display_name, state_id, created_at, updated_at)
		 VALUES ($1, 1, NOW(), NOW())
		 RETURNING id::text`, name+" Owner").Scan(&userID)
	if err != nil {
		t.Fatalf("SeedTestWorkspace: creating user: %v", err)
	}

	// Create workspace
	var wsID string
	err = pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ($1, 1, $2, NOW())
		 RETURNING id::text`, name, userID).Scan(&wsID)
	if err != nil {
		t.Fatalf("SeedTestWorkspace: creating workspace: %v", err)
	}

	// Switch to non-superuser role by default so RLS is enforced
	setOnAllConns(ctx, pool, []string{
		"SET ROLE rawdrive_app",
		"SELECT set_config('app.bypass_rls', '', false)",
		"SELECT set_config('app.workspace_id', '', false)",
	})

	return wsID
}

// SeedTestGallery creates a test gallery in the given workspace, returning the gallery ID.
func SeedTestGallery(t *testing.T, pool *pgxpool.Pool, ctx context.Context, workspaceID string, name string) string {
	t.Helper()
	setTestPool(pool)

	// Use superuser role for seeding
	setOnAllConns(ctx, pool, []string{
		"RESET ROLE",
		"SELECT set_config('app.bypass_rls', 'on', false)",
		"SELECT set_config('app.workspace_id', '', false)",
	})

	var galleryID string
	err := pool.QueryRow(ctx,
		`INSERT INTO galleries (workspace_id, title, created_at)
		 VALUES ($1, $2, NOW())
		 RETURNING id::text`, workspaceID, name).Scan(&galleryID)
	if err != nil {
		t.Fatalf("SeedTestGallery: creating gallery: %v", err)
	}

	// Switch to non-superuser role by default so RLS is enforced
	setOnAllConns(ctx, pool, []string{
		"SET ROLE rawdrive_app",
		"SELECT set_config('app.bypass_rls', '', false)",
		"SELECT set_config('app.workspace_id', '', false)",
	})

	return galleryID
}

// SeedTestWorkspaceMember creates a test user and adds them as a member of the workspace.
func SeedTestWorkspaceMember(t *testing.T, pool *pgxpool.Pool, ctx context.Context, workspaceID string) string {
	t.Helper()
	setTestPool(pool)

	// Use superuser role for seeding
	setOnAllConns(ctx, pool, []string{
		"RESET ROLE",
		"SELECT set_config('app.bypass_rls', 'on', false)",
		"SELECT set_config('app.workspace_id', '', false)",
	})

	// Create a test user
	var userID string
	err := pool.QueryRow(ctx,
		`INSERT INTO users (display_name, state_id, created_at, updated_at)
		 VALUES ('Test Member', 1, NOW(), NOW())
		 RETURNING id::text`).Scan(&userID)
	if err != nil {
		t.Fatalf("SeedTestWorkspaceMember: creating user: %v", err)
	}

	// Add as viewer (role_id 4)
	_, err = pool.Exec(ctx,
		`INSERT INTO workspace_members (workspace_id, user_id, role_id, joined_at)
		 VALUES ($1, $2, 4, NOW())`, workspaceID, userID)
	if err != nil {
		t.Fatalf("SeedTestWorkspaceMember: adding member: %v", err)
	}

	// Switch to non-superuser role by default so RLS is enforced
	setOnAllConns(ctx, pool, []string{
		"SET ROLE rawdrive_app",
		"SELECT set_config('app.bypass_rls', '', false)",
		"SELECT set_config('app.workspace_id', '', false)",
	})

	return userID
}

// WithWorkspaceContext sets the app.workspace_id session variable and switches to
// the rawdrive_app role (non-superuser) so RLS policies are enforced.
func WithWorkspaceContext(ctx context.Context, workspaceID string) context.Context {
	if testPoolInstance != nil {
		setOnAllConns(ctx, testPoolInstance, []string{
			"SET ROLE rawdrive_app",
			"SELECT set_config('app.bypass_rls', '', false)",
			fmt.Sprintf("SELECT set_config('app.workspace_id', '%s', false)", workspaceID),
		})
	}
	return ctx
}

// WithSuperAdminContext switches back to the superuser role, bypassing RLS.
func WithSuperAdminContext(ctx context.Context) context.Context {
	if testPoolInstance != nil {
		setOnAllConns(ctx, testPoolInstance, []string{
			"RESET ROLE",
			"SELECT set_config('app.bypass_rls', 'on', false)",
			"SELECT set_config('app.workspace_id', '', false)",
		})
	}
	return ctx
}

// WithImpersonationContext sets the workspace context for admin impersonation
// and logs the impersonation to the audit log.
func WithImpersonationContext(ctx context.Context, workspaceID string, adminUserID string) context.Context {
	if testPoolInstance != nil {
		// Use superuser first to log audit entry
		setOnAllConns(ctx, testPoolInstance, []string{
			"RESET ROLE",
			"SELECT set_config('app.bypass_rls', 'on', false)",
		})

		// Log impersonation to audit_log
		_, _ = testPoolInstance.Exec(ctx,
			`INSERT INTO audit_log (actor_id, action, resource_type, resource_id, metadata, created_at)
			 VALUES ($1, 'impersonation', 'workspace', $2, $3, NOW())`,
			adminUserID, workspaceID,
			fmt.Sprintf(`{"admin_id": "%s", "workspace_id": "%s"}`, adminUserID, workspaceID))

		// Then switch to rawdrive_app with workspace context
		setOnAllConns(ctx, testPoolInstance, []string{
			"SET ROLE rawdrive_app",
			"SELECT set_config('app.bypass_rls', 'on', false)",
			fmt.Sprintf("SELECT set_config('app.workspace_id', '%s', false)", workspaceID),
		})
	}
	return ctx
}
