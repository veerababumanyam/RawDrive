package service

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/repository"
)

// ─────────────────────────────────────────────────────────────────────────────
// M16 E49-S1: WorkspacePolicyService tests (Round 1 Foundation)
//
// Covers:
//   - FR-UPS-035: DefaultForTier returns StrictClientScan for pro-tier plans
//                 and Standard for free/basic plans.
//   - NFR-UPS-011: Set() emits a workspace.policy.changed audit event that
//                  includes the before/after policy mode values.
//
// Reference: M16-test-plan.json rounds[0].redTestFiles[1]
// ─────────────────────────────────────────────────────────────────────────────

// fakeAuditRecorder captures RecordAction calls synchronously so tests can
// inspect the emitted audit entries without dealing with the async goroutine
// inside AuditLogService.RecordAction.
type fakeAuditRecorder struct {
	mu      sync.Mutex
	entries []repository.AuditLogCreate
}

func (f *fakeAuditRecorder) RecordAction(ctx context.Context, entry repository.AuditLogCreate) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.entries = append(f.entries, entry)
}

func (f *fakeAuditRecorder) Entries() []repository.AuditLogCreate {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]repository.AuditLogCreate, len(f.entries))
	copy(out, f.entries)
	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// DefaultForTier
// ─────────────────────────────────────────────────────────────────────────────

func TestDefaultForTier_Pro_StrictClientScan(t *testing.T) {
	svc := NewWorkspacePolicyService(nil, nil)

	for _, tier := range []string{"pro", "professional", "enterprise", "studio"} {
		t.Run(tier, func(t *testing.T) {
			got := svc.DefaultForTier(tier)
			assert.Equal(t, PolicyModeStrictClientScan, got,
				"tier %q should default to strict_client_scan (FR-UPS-035)", tier)
		})
	}
}

func TestDefaultForTier_Free_Standard(t *testing.T) {
	svc := NewWorkspacePolicyService(nil, nil)

	for _, tier := range []string{"free", "standard", "basic", ""} {
		t.Run(tier, func(t *testing.T) {
			got := svc.DefaultForTier(tier)
			assert.Equal(t, PolicyModeStandard, got,
				"tier %q should default to standard (FR-UPS-035)", tier)
		})
	}
}

func TestDefaultForTier_UnknownTier_FailsClosedToStandard(t *testing.T) {
	svc := NewWorkspacePolicyService(nil, nil)

	// Unknown tiers fall through to PolicyModeStandard — the conservative
	// default that lets the upload succeed rather than blocking legitimate
	// users on a misconfigured plan row.
	got := svc.DefaultForTier("some-future-tier")
	assert.Equal(t, PolicyModeStandard, got)
}

// ─────────────────────────────────────────────────────────────────────────────
// Set audit event emission (NFR-UPS-011)
// ─────────────────────────────────────────────────────────────────────────────

func TestSet_WritesAuditEvent(t *testing.T) {
	rec := &fakeAuditRecorder{}
	svc := newWorkspacePolicyServiceWithRecorder(nil, rec)

	workspaceID := uuid.New()
	actorID := uuid.New()

	err := svc.Set(context.Background(), workspaceID, PolicyModeStrictClientScan, actorID)
	require.NoError(t, err)

	entries := rec.Entries()
	require.Len(t, entries, 1, "Set() must emit exactly one audit event (NFR-UPS-011)")

	e := entries[0]
	assert.Equal(t, "workspace.policy.changed", e.Action)
	assert.Equal(t, "workspace", e.ResourceType)
	assert.Equal(t, workspaceID.String(), e.ResourceID)
	assert.Equal(t, "admin", e.ActorType)
	assert.Equal(t, actorID, e.ActorID)
	require.NotNil(t, e.WorkspaceID)
	assert.Equal(t, workspaceID, *e.WorkspaceID)
	assert.Equal(t, "info", e.Severity)

	// Before/after state must include the policy mode transition so auditors
	// can reconstruct the change without joining other tables.
	assert.Contains(t, string(e.BeforeState), "upload_policy_mode")
	assert.Contains(t, string(e.AfterState), string(PolicyModeStrictClientScan))
}

func TestSet_InvalidMode_Rejected(t *testing.T) {
	rec := &fakeAuditRecorder{}
	svc := newWorkspacePolicyServiceWithRecorder(nil, rec)

	err := svc.Set(context.Background(), uuid.New(), PolicyMode("garbage"), uuid.New())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid policy mode")
	assert.Len(t, rec.Entries(), 0, "rejected writes must not emit audit events")
}

func TestSet_NilAuditLog_DoesNotPanic(t *testing.T) {
	// Regression guard: constructing the service with a nil audit log must
	// not cause Set() to panic. Nil is the documented unit-test construction.
	svc := NewWorkspacePolicyService(nil, nil)
	err := svc.Set(context.Background(), uuid.New(), PolicyModeStrictClientScan, uuid.New())
	require.NoError(t, err)
}

// ─────────────────────────────────────────────────────────────────────────────
// Get / cache behaviour (no DB)
// ─────────────────────────────────────────────────────────────────────────────

func TestGet_NoDB_ReturnsStandardDefault(t *testing.T) {
	svc := NewWorkspacePolicyService(nil, nil)

	mode, err := svc.Get(context.Background(), uuid.New())
	require.NoError(t, err)
	assert.Equal(t, PolicyModeStandard, mode)
}

func TestSet_ThenGet_ReflectsNewMode(t *testing.T) {
	rec := &fakeAuditRecorder{}
	svc := newWorkspacePolicyServiceWithRecorder(nil, rec)

	workspaceID := uuid.New()
	require.NoError(t, svc.Set(context.Background(), workspaceID, PolicyModeStrictOriginalPreserve, uuid.New()))

	mode, err := svc.Get(context.Background(), workspaceID)
	require.NoError(t, err)
	assert.Equal(t, PolicyModeStrictOriginalPreserve, mode,
		"Set() must populate the cache so subsequent Get() returns the new mode")
}

func TestInvalidate_DropsCachedEntry(t *testing.T) {
	rec := &fakeAuditRecorder{}
	svc := newWorkspacePolicyServiceWithRecorder(nil, rec)

	workspaceID := uuid.New()
	require.NoError(t, svc.Set(context.Background(), workspaceID, PolicyModeStrictClientScan, uuid.New()))

	svc.Invalidate(workspaceID)

	// With no DB, post-invalidate Get falls back to PolicyModeStandard since
	// the cache entry has been dropped.
	mode, err := svc.Get(context.Background(), workspaceID)
	require.NoError(t, err)
	assert.Equal(t, PolicyModeStandard, mode)
}

// ─────────────────────────────────────────────────────────────────────────────
// CACHE-5: cross-node policy cache coherence (shared Valkey backing)
//
// The in-process cache is per-node. Without a shared backing, a policy change
// on app node A leaves node B serving the stale mode for up to the 5-minute
// TTL. These tests prove the shared-cache seam: when a cross-node backing is
// wired, Set() writes through it (immediately visible to peers), Invalidate()
// DELetes the shared key (so a peer's next read misses and re-queries), and two
// services sharing one backing — the model for two app nodes against one Valkey
// — observe each other's changes. Mirrors the storage-analytics shared-cache
// pattern (StorageAccounting.WithSharedCache).
// ─────────────────────────────────────────────────────────────────────────────

// fakeSharedPolicyCache is an in-memory stand-in for the Valkey-backed
// cross-node policy cache. It lets us prove the shared-cache wiring and
// cross-node invalidation without a live Valkey — matching this package's
// no-DB test convention. The signature mirrors the production
// sharedPolicyCache interface (Get/Set/Del over JSON bytes).
type fakeSharedPolicyCache struct {
	mu   sync.Mutex
	data map[string][]byte
	gets int
	sets int
	dels int
}

func newFakeSharedPolicyCache() *fakeSharedPolicyCache {
	return &fakeSharedPolicyCache{data: make(map[string][]byte)}
}

func (f *fakeSharedPolicyCache) Get(_ context.Context, key string) ([]byte, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.gets++
	b, ok := f.data[key]
	return b, ok, nil
}

func (f *fakeSharedPolicyCache) Set(_ context.Context, key string, val []byte, _ time.Duration) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sets++
	cp := make([]byte, len(val))
	copy(cp, val)
	f.data[key] = cp
}

func (f *fakeSharedPolicyCache) Del(_ context.Context, key string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.dels++
	delete(f.data, key)
}

// When a shared cache is wired, Set() must write through it (not the
// in-process map) so a peer node reading the same backing sees the new mode.
func TestPolicy_SharedCache_SetWritesThrough(t *testing.T) {
	fake := newFakeSharedPolicyCache()
	svc := newWorkspacePolicyServiceWithRecorder(nil, &fakeAuditRecorder{}).WithSharedCache(fake)

	workspaceID := uuid.New()
	require.NoError(t, svc.Set(context.Background(), workspaceID, PolicyModeStrictClientScan, uuid.New()))

	assert.GreaterOrEqual(t, fake.sets, 1, "Set() must write the shared cache so peers see the change")

	mode, err := svc.Get(context.Background(), workspaceID)
	require.NoError(t, err)
	assert.Equal(t, PolicyModeStrictClientScan, mode, "Get() must read the value back through the shared cache")
	assert.GreaterOrEqual(t, fake.gets, 1, "Get() must consult the shared cache")
}

// The core CACHE-5 regression: a policy change on node A must be visible on
// node B within seconds, not after the 5-minute TTL. Model two app nodes as two
// services sharing one backing.
func TestPolicy_SharedCache_PropagatesAcrossNodes(t *testing.T) {
	fake := newFakeSharedPolicyCache()
	nodeA := newWorkspacePolicyServiceWithRecorder(nil, &fakeAuditRecorder{}).WithSharedCache(fake)
	nodeB := newWorkspacePolicyServiceWithRecorder(nil, &fakeAuditRecorder{}).WithSharedCache(fake)

	workspaceID := uuid.New()

	// Node A changes the policy.
	require.NoError(t, nodeA.Set(context.Background(), workspaceID, PolicyModeStrictClientScan, uuid.New()))

	// Node B — which never received the write directly — must now observe it via
	// the shared backing, not a stale in-process entry.
	mode, err := nodeB.Get(context.Background(), workspaceID)
	require.NoError(t, err)
	assert.Equal(t, PolicyModeStrictClientScan, mode,
		"a policy change on node A must be visible on node B via the shared cache (CACHE-5)")
}

// Invalidate() must DELete the SHARED key so a peer node's next read misses and
// re-queries the source of truth — this is what kills cross-node staleness.
func TestPolicy_SharedCache_InvalidateDeletesSharedKey(t *testing.T) {
	fake := newFakeSharedPolicyCache()
	svc := newWorkspacePolicyServiceWithRecorder(nil, &fakeAuditRecorder{}).WithSharedCache(fake)

	workspaceID := uuid.New()
	require.NoError(t, svc.Set(context.Background(), workspaceID, PolicyModeStrictClientScan, uuid.New()))
	require.NotEmpty(t, fake.data, "precondition: shared key written")

	svc.Invalidate(workspaceID)
	assert.GreaterOrEqual(t, fake.dels, 1, "Invalidate() must DEL the shared key")
	assert.Empty(t, fake.data, "shared entry must be gone after invalidation")
}

// With no shared cache wired, behaviour must be exactly the in-process cache
// (single-node / no Valkey): the legacy path is preserved and untouched.
func TestPolicy_NoSharedCache_StaysInProcess(t *testing.T) {
	svc := newWorkspacePolicyServiceWithRecorder(nil, &fakeAuditRecorder{}) // no WithSharedCache

	workspaceID := uuid.New()
	require.NoError(t, svc.Set(context.Background(), workspaceID, PolicyModeStrictOriginalPreserve, uuid.New()))

	mode, err := svc.Get(context.Background(), workspaceID)
	require.NoError(t, err)
	assert.Equal(t, PolicyModeStrictOriginalPreserve, mode)

	svc.Invalidate(workspaceID)
	mode, err = svc.Get(context.Background(), workspaceID)
	require.NoError(t, err)
	assert.Equal(t, PolicyModeStandard, mode, "in-process entry must be gone after invalidation")
}
