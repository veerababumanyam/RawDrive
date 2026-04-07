package rbac_test

import (
	"context"
	"testing"
	"time"

	"github.com/rawdrive/backend/internal/rbac"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockPermissionStore simulates RBAC persistence.
type mockPermissionStore struct {
	roles map[string]map[string]rbac.Role // workspaceID -> userID -> Role
}

func newMockPermissionStore() *mockPermissionStore {
	return &mockPermissionStore{
		roles: map[string]map[string]rbac.Role{
			"ws-1": {
				"owner-user":   rbac.RoleOwner,
				"admin-user":   rbac.RoleAdmin,
				"editor-user":  rbac.RoleEditor,
				"viewer-user":  rbac.RoleViewer,
			},
			"ws-2": {
				"owner-user": rbac.RoleViewer, // different role in different workspace
			},
		},
	}
}

func (m *mockPermissionStore) GetRole(ctx context.Context, userID, workspaceID string) (rbac.Role, error) {
	if ws, ok := m.roles[workspaceID]; ok {
		if role, ok := ws[userID]; ok {
			return role, nil
		}
	}
	return "", rbac.ErrRoleNotFound
}

func (m *mockPermissionStore) SetRole(ctx context.Context, userID, workspaceID string, role rbac.Role) error {
	if m.roles[workspaceID] == nil {
		m.roles[workspaceID] = map[string]rbac.Role{}
	}
	m.roles[workspaceID][userID] = role
	return nil
}

// mockAuditLogger records audit events.
type mockAuditLogger struct {
	entries []string
}

func (m *mockAuditLogger) LogPermissionDenied(ctx context.Context, userID, workspaceID, resource, action string) {
	m.entries = append(m.entries, userID+":"+action+":"+resource)
}

func newTestEngine() (rbac.Engine, *mockAuditLogger) {
	store := newMockPermissionStore()
	audit := &mockAuditLogger{}
	engine := rbac.NewEngine(store, audit)
	return engine, audit
}

func TestEvaluate_OwnerFullAccess(t *testing.T) {
	engine, _ := newTestEngine()
	ctx := context.Background()

	allowed, err := engine.Evaluate(ctx, "owner-user", "ws-1", "workspace", "delete")
	require.NoError(t, err)
	assert.True(t, allowed, "Owner should have full access")
}

func TestEvaluate_AdminNoDelete(t *testing.T) {
	engine, _ := newTestEngine()
	ctx := context.Background()

	allowed, err := engine.Evaluate(ctx, "admin-user", "ws-1", "workspace", "delete")
	require.NoError(t, err)
	assert.False(t, allowed, "Admin should not be able to delete workspace")
}

func TestEvaluate_EditorNoTeamMgmt(t *testing.T) {
	engine, _ := newTestEngine()
	ctx := context.Background()

	allowed, err := engine.Evaluate(ctx, "editor-user", "ws-1", "team", "manage")
	require.NoError(t, err)
	assert.False(t, allowed, "Editor should not manage team")
}

func TestEvaluate_ViewerReadOnly(t *testing.T) {
	engine, _ := newTestEngine()
	ctx := context.Background()

	allowed, err := engine.Evaluate(ctx, "viewer-user", "ws-1", "files", "read")
	require.NoError(t, err)
	assert.True(t, allowed, "Viewer should be able to read")

	allowed, err = engine.Evaluate(ctx, "viewer-user", "ws-1", "files", "write")
	require.NoError(t, err)
	assert.False(t, allowed, "Viewer should not be able to write")
}

func TestEvaluate_UnknownRole(t *testing.T) {
	engine, _ := newTestEngine()
	ctx := context.Background()

	allowed, err := engine.Evaluate(ctx, "unknown-user", "ws-1", "files", "read")
	require.NoError(t, err)
	assert.False(t, allowed, "unknown role should be denied")
}

func TestEvaluate_PermissionCaching(t *testing.T) {
	engine, _ := newTestEngine()
	ctx := context.Background()

	// Warm the cache
	_, err := engine.Evaluate(ctx, "owner-user", "ws-1", "files", "read")
	require.NoError(t, err)

	start := time.Now()
	allowed, err := engine.Evaluate(ctx, "owner-user", "ws-1", "files", "read")
	elapsed := time.Since(start)

	require.NoError(t, err)
	assert.True(t, allowed)
	assert.Less(t, elapsed, 50*time.Millisecond, "cached permission check should be < 50ms")
}

func TestEvaluate_CacheExpiry(t *testing.T) {
	store := newMockPermissionStore()
	audit := &mockAuditLogger{}
	engine := rbac.NewEngineWithCacheTTL(store, audit, 1*time.Millisecond)
	ctx := context.Background()

	// First call populates cache
	allowed, err := engine.Evaluate(ctx, "owner-user", "ws-1", "files", "read")
	require.NoError(t, err)
	assert.True(t, allowed)

	time.Sleep(10 * time.Millisecond)

	// After TTL expires, should re-fetch from store
	allowed, err = engine.Evaluate(ctx, "owner-user", "ws-1", "files", "read")
	require.NoError(t, err)
	assert.True(t, allowed)
}

func TestAssignRole_NoEscalation(t *testing.T) {
	engine, _ := newTestEngine()
	ctx := context.Background()

	err := engine.AssignRole(ctx, "admin-user", "some-user", "ws-1", rbac.RoleOwner)
	assert.Error(t, err, "Admin should not be able to assign Owner role (privilege escalation)")
}

func TestAssignRole_OwnerCanAssignAdmin(t *testing.T) {
	engine, _ := newTestEngine()
	ctx := context.Background()

	err := engine.AssignRole(ctx, "owner-user", "some-user", "ws-1", rbac.RoleAdmin)
	assert.NoError(t, err, "Owner should be able to assign Admin role")
}

func TestPermissionMatrix_AllEndpoints(t *testing.T) {
	matrix := rbac.GetPermissionMatrix()
	require.NotEmpty(t, matrix, "permission matrix should not be empty")

	endpoints := rbac.GetAllEndpoints()
	for _, endpoint := range endpoints {
		_, exists := matrix[endpoint]
		assert.True(t, exists, "endpoint %q should have a permission declaration", endpoint)
	}
}

func TestPermissionDenial_LogsAttempt(t *testing.T) {
	engine, audit := newTestEngine()
	ctx := context.Background()

	_, _ = engine.Evaluate(ctx, "viewer-user", "ws-1", "workspace", "delete")
	assert.NotEmpty(t, audit.entries, "denied permission should be logged to audit")
}

func TestEvaluate_WorkspaceScoped(t *testing.T) {
	engine, _ := newTestEngine()
	ctx := context.Background()

	allowed, err := engine.Evaluate(ctx, "owner-user", "ws-1", "files", "write")
	require.NoError(t, err)
	assert.True(t, allowed, "owner in ws-1 should have write access")

	allowed, err = engine.Evaluate(ctx, "owner-user", "ws-nonexistent", "files", "write")
	require.NoError(t, err)
	assert.False(t, allowed, "user with no role in workspace should be denied")
}

func TestEvaluate_MultipleWorkspaces(t *testing.T) {
	engine, _ := newTestEngine()
	ctx := context.Background()

	// owner-user is Owner in ws-1 but Viewer in ws-2
	allowed, err := engine.Evaluate(ctx, "owner-user", "ws-1", "workspace", "delete")
	require.NoError(t, err)
	assert.True(t, allowed, "Owner role in ws-1 should allow delete")

	allowed, err = engine.Evaluate(ctx, "owner-user", "ws-2", "workspace", "delete")
	require.NoError(t, err)
	assert.False(t, allowed, "Viewer role in ws-2 should deny delete")
}

func TestEvaluate_PerformanceUnderLoad(t *testing.T) {
	engine, _ := newTestEngine()
	ctx := context.Background()

	start := time.Now()
	for i := 0; i < 10000; i++ {
		_, err := engine.Evaluate(ctx, "owner-user", "ws-1", "files", "read")
		require.NoError(t, err)
	}
	elapsed := time.Since(start)
	assert.Less(t, elapsed, 500*time.Millisecond, "10000 permission checks should complete in < 500ms")
}

func TestPermissionMatrix_NoGaps(t *testing.T) {
	matrix := rbac.GetPermissionMatrix()
	endpoints := rbac.GetAllEndpoints()

	for _, endpoint := range endpoints {
		perms, exists := matrix[endpoint]
		assert.True(t, exists, "endpoint %q must have permission declaration", endpoint)
		assert.NotEmpty(t, perms, "endpoint %q must have at least one permission rule", endpoint)
	}
}
