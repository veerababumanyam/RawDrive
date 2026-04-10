package service

import (
	"context"
	"sync"
	"testing"

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
