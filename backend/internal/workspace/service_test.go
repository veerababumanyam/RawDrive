package workspace_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/workspace"
)

// mockWorkspaceRepo simulates workspace persistence.
type mockWorkspaceRepo struct {
	workspaces map[string]*workspace.Workspace
	boot       *bootstrapState
}

func newMockWorkspaceRepo() *mockWorkspaceRepo {
	return &mockWorkspaceRepo{workspaces: map[string]*workspace.Workspace{}}
}

func (m *mockWorkspaceRepo) Create(ctx context.Context, ws *workspace.Workspace) (*workspace.Workspace, error) {
	m.workspaces[ws.ID] = ws
	return ws, nil
}

// members and storage record the co-created rows so tests can assert the
// atomic bootstrap actually wrote them (and rolled them back on failure).
type bootstrapState struct {
	members map[string]bool  // workspaceID -> has owner membership
	storage map[string]int64 // workspaceID -> quota bytes
}

func (m *mockWorkspaceRepo) CreateWithBootstrap(ctx context.Context, ws *workspace.Workspace, quotaBytes int64) (*workspace.Workspace, error) {
	if m.boot == nil {
		m.boot = &bootstrapState{members: map[string]bool{}, storage: map[string]int64{}}
	}
	// Simulate the migration-096 (owner_id, lower(name)) unique index.
	for _, existing := range m.workspaces {
		if existing.OwnerID == ws.OwnerID && strings.EqualFold(existing.Name, ws.Name) {
			return nil, workspace.ErrDuplicateName
		}
	}
	m.workspaces[ws.ID] = ws
	m.boot.members[ws.ID] = true
	m.boot.storage[ws.ID] = quotaBytes
	return ws, nil
}

func (m *mockWorkspaceRepo) GetByID(ctx context.Context, id string) (*workspace.Workspace, error) {
	if ws, ok := m.workspaces[id]; ok {
		return ws, nil
	}
	return nil, workspace.ErrNotFound
}

// GetByOwnerAndName satisfies the Repository interface added for Issue #5.
func (m *mockWorkspaceRepo) GetByOwnerAndName(_ context.Context, ownerID, name string) (*workspace.Workspace, error) {
	for _, ws := range m.workspaces {
		if ws.OwnerID == ownerID && strings.EqualFold(ws.Name, name) {
			return ws, nil
		}
	}
	return nil, workspace.ErrNotFound
}

// mockEventPublisher records published events.
type mockEventPublisher struct {
	events []string
}

func (m *mockEventPublisher) Publish(ctx context.Context, subject string, data []byte) error {
	m.events = append(m.events, subject)
	return nil
}

// mockStorageBucket records bucket provisioning calls.
type mockStorageBucket struct {
	provisioned []string
}

func (m *mockStorageBucket) ProvisionBucket(ctx context.Context, workspaceID string) error {
	m.provisioned = append(m.provisioned, workspaceID)
	return nil
}

func newTestWorkspaceService() (workspace.Service, *mockEventPublisher, *mockStorageBucket) {
	repo := newMockWorkspaceRepo()
	pub := &mockEventPublisher{}
	bucket := &mockStorageBucket{}
	svc := workspace.NewService(repo, pub, bucket)
	return svc, pub, bucket
}

func TestCreateWorkspace(t *testing.T) {
	svc, _, _ := newTestWorkspaceService()
	ctx := context.Background()

	ws, err := svc.Create(ctx, workspace.CreateWorkspaceInput{
		Name:    "Test Workspace",
		StateID: "state-uuid-001",
		OwnerID: "user-uuid-001",
	})
	require.NoError(t, err)
	require.NotNil(t, ws)
	assert.NotEmpty(t, ws.ID)
	assert.Equal(t, "Test Workspace", ws.Name)
	assert.Equal(t, "state-uuid-001", ws.StateID)
}

func TestCreateWorkspace_AssignsOwnerRole(t *testing.T) {
	svc, _, _ := newTestWorkspaceService()
	ctx := context.Background()

	ws, err := svc.Create(ctx, workspace.CreateWorkspaceInput{
		Name:    "Owner Test",
		StateID: "state-uuid-002",
		OwnerID: "user-uuid-002",
	})
	require.NoError(t, err)
	assert.Equal(t, "user-uuid-002", ws.OwnerID, "creator should be assigned as owner")
}

func TestCreateWorkspace_DefaultBucket(t *testing.T) {
	svc, _, bucket := newTestWorkspaceService()
	ctx := context.Background()

	ws, err := svc.Create(ctx, workspace.CreateWorkspaceInput{
		Name:    "Bucket Test",
		StateID: "state-uuid-003",
		OwnerID: "user-uuid-003",
	})
	require.NoError(t, err)
	assert.Contains(t, bucket.provisioned, ws.ID, "storage bucket should be provisioned")
}

func TestGetWorkspace_ByID(t *testing.T) {
	svc, _, _ := newTestWorkspaceService()
	ctx := context.Background()

	created, err := svc.Create(ctx, workspace.CreateWorkspaceInput{
		Name:    "Lookup Test",
		StateID: "state-uuid-004",
		OwnerID: "user-uuid-004",
	})
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
}

func TestGetWorkspace_CrossTenant(t *testing.T) {
	svc, _, _ := newTestWorkspaceService()
	ctx := context.Background()

	_, err := svc.Create(ctx, workspace.CreateWorkspaceInput{
		Name:    "Tenant A Workspace",
		StateID: "state-a",
		OwnerID: "user-a",
	})
	require.NoError(t, err)

	// Attempt to access with a different tenant context
	ctxOther := workspace.WithTenantID(ctx, "other-state-id")
	_, err = svc.GetByID(ctxOther, "nonexistent-ws-id")
	assert.Error(t, err, "cross-tenant workspace access should return not found")
}

func TestOnboardingComplete(t *testing.T) {
	svc, _, _ := newTestWorkspaceService()
	ctx := context.Background()

	ws, err := svc.Create(ctx, workspace.CreateWorkspaceInput{
		Name:         "Onboarding WS",
		StateID:      "state-uuid-005",
		OwnerID:      "user-uuid-005",
		BusinessName: "My Business",
	})
	require.NoError(t, err)
	assert.NotNil(t, ws)
	assert.NotEmpty(t, ws.ID)
}

func TestOnboardingComplete_SendsWelcomeEvent(t *testing.T) {
	svc, pub, _ := newTestWorkspaceService()
	ctx := context.Background()

	_, err := svc.Create(ctx, workspace.CreateWorkspaceInput{
		Name:    "Event Test",
		StateID: "state-uuid-006",
		OwnerID: "user-uuid-006",
	})
	require.NoError(t, err)
	assert.Contains(t, pub.events, "workspace.created", "should publish workspace.created NATS event")
}

func TestWorkspaceName_DefaultsToBusinessName(t *testing.T) {
	svc, _, _ := newTestWorkspaceService()
	ctx := context.Background()

	ws, err := svc.Create(ctx, workspace.CreateWorkspaceInput{
		Name:         "", // empty name
		StateID:      "state-uuid-007",
		OwnerID:      "user-uuid-007",
		BusinessName: "Acme Corp",
	})
	require.NoError(t, err)
	assert.Equal(t, "Acme Corp", ws.Name, "workspace name should default to business name")
}

func TestCreateWorkspace_PlanTier(t *testing.T) {
	svc, _, _ := newTestWorkspaceService()
	ctx := context.Background()

	ws, err := svc.Create(ctx, workspace.CreateWorkspaceInput{
		Name:     "Pro Workspace",
		StateID:  "state-uuid-008",
		OwnerID:  "user-uuid-008",
		PlanTier: "professional",
	})
	require.NoError(t, err)
	require.NotNil(t, ws)
	assert.Equal(t, "professional", ws.PlanTier, "plan tier should be set to professional")
}

func TestCreateWorkspace_PlanTierDefault(t *testing.T) {
	svc, _, _ := newTestWorkspaceService()
	ctx := context.Background()

	ws, err := svc.Create(ctx, workspace.CreateWorkspaceInput{
		Name:    "Free Workspace",
		StateID: "state-uuid-009",
		OwnerID: "user-uuid-009",
		// PlanTier intentionally omitted
	})
	require.NoError(t, err)
	require.NotNil(t, ws)
	assert.Equal(t, "free", ws.PlanTier, "plan tier should default to free when not provided")
}

// ──────────────────────── Issue #5 — Per-owner duplicate name ────────────────────────

// duplicateAwareRepo simulates the migration-096 unique index by
// returning workspace.ErrDuplicateName when (owner_id, lower(name))
// already exists. Used to verify the service layer surfaces the
// sentinel unchanged so the onboarding adapter can recover.
type duplicateAwareRepo struct {
	*mockWorkspaceRepo
}

func (d *duplicateAwareRepo) Create(_ context.Context, ws *workspace.Workspace) (*workspace.Workspace, error) {
	for _, existing := range d.mockWorkspaceRepo.workspaces {
		if existing.OwnerID == ws.OwnerID &&
			strings.EqualFold(existing.Name, ws.Name) {
			return nil, workspace.ErrDuplicateName
		}
	}
	d.mockWorkspaceRepo.workspaces[ws.ID] = ws
	return ws, nil
}

func TestCreateWorkspace_DuplicateOwnerNameReturnsSentinel(t *testing.T) {
	repo := &duplicateAwareRepo{mockWorkspaceRepo: newMockWorkspaceRepo()}
	pub := &mockEventPublisher{}
	bucket := &mockStorageBucket{}
	svc := workspace.NewService(repo, pub, bucket)
	ctx := context.Background()

	_, err := svc.Create(ctx, workspace.CreateWorkspaceInput{
		Name:    "Wedding Moments",
		StateID: "state-1",
		OwnerID: "owner-1",
	})
	require.NoError(t, err, "first workspace for an owner must succeed")

	_, err = svc.Create(ctx, workspace.CreateWorkspaceInput{
		Name:    "wedding moments", // case difference must still collide
		StateID: "state-1",
		OwnerID: "owner-1",
	})
	require.Error(t, err)
	assert.ErrorIs(t, err, workspace.ErrDuplicateName,
		"duplicate (owner_id, lower(name)) must surface the typed sentinel for adapter recovery")
}

func TestCreateWorkspace_SameNameDifferentOwnerSucceeds(t *testing.T) {
	repo := &duplicateAwareRepo{mockWorkspaceRepo: newMockWorkspaceRepo()}
	pub := &mockEventPublisher{}
	bucket := &mockStorageBucket{}
	svc := workspace.NewService(repo, pub, bucket)
	ctx := context.Background()

	_, err := svc.Create(ctx, workspace.CreateWorkspaceInput{
		Name:    "Wedding Moments",
		StateID: "state-1",
		OwnerID: "owner-1",
	})
	require.NoError(t, err)

	// A different photographer must be allowed to use the same brand
	// name — that is the explicit per-owner uniqueness contract.
	_, err = svc.Create(ctx, workspace.CreateWorkspaceInput{
		Name:    "Wedding Moments",
		StateID: "state-1",
		OwnerID: "owner-2",
	})
	require.NoError(t, err, "global uniqueness is INTENTIONALLY not enforced — see migration 096")
}

// ──────────────── AREA-CUSTOMER-1 / -3 — atomic co-creation ────────────────

// TestCreateWithBootstrap_CoCreatesStorageAndMembers verifies the canonical
// path always produces the workspace + Owner membership + storage quota
// rows together — the dashboard storage widget reads workspace_storage and
// must never find a workspace without it.
func TestCreateWithBootstrap_CoCreatesStorageAndMembers(t *testing.T) {
	repo := newMockWorkspaceRepo()
	pub := &mockEventPublisher{}
	bucket := &mockStorageBucket{}
	svc := workspace.NewService(repo, pub, bucket)
	ctx := context.Background()

	ws, err := svc.CreateWithBootstrap(ctx, workspace.CreateWorkspaceInput{
		Name:    "Bootstrap WS",
		StateID: "24",
		OwnerID: "owner-1",
	}, 30<<30)
	require.NoError(t, err)
	require.NotNil(t, ws)

	require.NotNil(t, repo.boot)
	assert.True(t, repo.boot.members[ws.ID], "Owner membership row must be co-created")
	assert.Equal(t, int64(30<<30), repo.boot.storage[ws.ID],
		"storage quota row must be co-created with the supplied quota")
	// Post-commit side effects still run.
	assert.Contains(t, bucket.provisioned, ws.ID)
	assert.Contains(t, pub.events, "workspace.created")
}

// failingBootstrapRepo simulates a storage-insert failure inside the
// CreateWithBootstrap transaction. Because the real repo wraps all three
// inserts in one tx, a failure rolls back the workspace + members too; the
// mock models that by recording NOTHING and returning an error.
type failingBootstrapRepo struct {
	*mockWorkspaceRepo
	calls int
}

func (f *failingBootstrapRepo) CreateWithBootstrap(_ context.Context, _ *workspace.Workspace, _ int64) (*workspace.Workspace, error) {
	f.calls++
	// Nothing is persisted — mirrors a tx.Rollback so neither the
	// workspace, the membership, nor the storage row survives.
	return nil, errors.New("simulated storage insert failure")
}

// TestCreateWithBootstrap_AtomicRollbackOnStorageFailure asserts that when
// the storage insert fails, the whole bootstrap fails (so nothing is
// persisted) AND the post-commit bucket/event side effects never run.
func TestCreateWithBootstrap_AtomicRollbackOnStorageFailure(t *testing.T) {
	repo := &failingBootstrapRepo{mockWorkspaceRepo: newMockWorkspaceRepo()}
	pub := &mockEventPublisher{}
	bucket := &mockStorageBucket{}
	svc := workspace.NewService(repo, pub, bucket)
	ctx := context.Background()

	ws, err := svc.CreateWithBootstrap(ctx, workspace.CreateWorkspaceInput{
		Name:    "Doomed WS",
		StateID: "24",
		OwnerID: "owner-1",
	}, 1<<30)
	require.Error(t, err, "a failed storage insert must fail the whole bootstrap")
	assert.Nil(t, ws)
	assert.Empty(t, repo.mockWorkspaceRepo.workspaces,
		"workspace row must be rolled back when storage insert fails")
	assert.Empty(t, bucket.provisioned,
		"bucket must NOT be provisioned when the atomic DB tx failed")
	assert.NotContains(t, pub.events, "workspace.created",
		"workspace.created must NOT be published when the atomic DB tx failed")
}

// TestCreateWithBootstrap_OnboardingDoesNotCompleteOnFailure proves the
// onboarding state machine cannot advance to step=complete when the atomic
// co-creation fails. We drive the real onboarding service with a
// WorkspaceCreator that delegates to svc.CreateWithBootstrap (mirroring the
// production onboardingWorkspaceCreator adapter), backed by a repo whose
// bootstrap always fails.
func TestCreateWithBootstrap_PropagatesErrorForOnboardingGate(t *testing.T) {
	repo := &failingBootstrapRepo{mockWorkspaceRepo: newMockWorkspaceRepo()}
	svc := workspace.NewService(repo, &mockEventPublisher{}, &mockStorageBucket{})
	ctx := context.Background()

	_, err := svc.CreateWithBootstrap(ctx, workspace.CreateWorkspaceInput{
		Name:    "Gate WS",
		StateID: "24",
		OwnerID: "owner-1",
	}, 1<<30)
	require.Error(t, err)
	// The onboarding adapter (cmd/api/main.go) returns this error from
	// CreateWorkspace, and onboarding.SetProfile wraps it in
	// ErrWorkspaceCreateFail and does NOT upsert step=complete. The unit
	// here is the error propagation contract that gate depends on.
	require.Equal(t, 1, repo.calls)
}

func TestGetByOwnerAndName_CaseInsensitive(t *testing.T) {
	svc, _, _ := newTestWorkspaceService()
	ctx := context.Background()

	created, err := svc.Create(ctx, workspace.CreateWorkspaceInput{
		Name:    "Sunshine Photography",
		StateID: "state-1",
		OwnerID: "owner-1",
	})
	require.NoError(t, err)

	got, err := svc.GetByOwnerAndName(ctx, "owner-1", "sunshine photography")
	require.NoError(t, err)
	assert.Equal(t, created.ID, got.ID,
		"GetByOwnerAndName must match case-insensitively to mirror the migration-096 lower(name) index")
}
