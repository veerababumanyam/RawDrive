package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// ─────────────────────────────────────────────────────────────────────────────
// M16 E49-S1: Workspace policy mode service.
//
// Persists and reads the upload_policy_mode column on the workspaces table
// (migration 055). Provides a cached Get() for the hot path, an audited Set()
// for admin changes, and a DefaultForTier() helper that decides which mode
// a newly-created workspace should start with.
//
// The upload_manifest_validation service (Round 2 wiring in M16) reads the
// policy mode via the WorkspacePolicyReader interface, so this service
// satisfies that contract.
//
// Spec: feature-prd.md §4.6, stories/49-1-workspace-policy-db.md
// ─────────────────────────────────────────────────────────────────────────────

// WorkspacePolicyDB is the minimal DB surface the service needs. Kept as an
// interface so tests can swap in a stub without spinning up a real pgx pool.
type WorkspacePolicyDB interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// auditRecorder is the narrow audit-log surface used by WorkspacePolicyService.
// *AuditLogService satisfies this interface; tests substitute a synchronous
// fake so they can observe emitted events without dealing with goroutine
// timing inside AuditLogService.RecordAction.
type auditRecorder interface {
	RecordAction(ctx context.Context, entry repository.AuditLogCreate)
}

// WorkspacePolicyService reads and writes the workspace.upload_policy_mode
// column. Implements the WorkspacePolicyReader interface used by
// UploadManifestValidation.
type WorkspacePolicyService struct {
	db       WorkspacePolicyDB
	auditLog auditRecorder

	mu       sync.RWMutex
	cache    map[uuid.UUID]policyCache
	cacheTTL time.Duration
}

type policyCache struct {
	mode      PolicyMode
	expiresAt time.Time
}

// NewWorkspacePolicyService constructs the service with a 5-minute cache TTL.
// Pass nil auditLog to disable audit logging in tests.
func NewWorkspacePolicyService(db WorkspacePolicyDB, auditLog *AuditLogService) *WorkspacePolicyService {
	var rec auditRecorder
	if auditLog != nil {
		rec = auditLog
	}
	return &WorkspacePolicyService{
		db:       db,
		auditLog: rec,
		cache:    make(map[uuid.UUID]policyCache),
		cacheTTL: 5 * time.Minute,
	}
}

// newWorkspacePolicyServiceWithRecorder is the test-only constructor that
// allows injecting a synchronous audit recorder. Not exported.
func newWorkspacePolicyServiceWithRecorder(db WorkspacePolicyDB, rec auditRecorder) *WorkspacePolicyService {
	return &WorkspacePolicyService{
		db:       db,
		auditLog: rec,
		cache:    make(map[uuid.UUID]policyCache),
		cacheTTL: 5 * time.Minute,
	}
}

// Get returns the workspace's configured policy mode. Falls back to
// PolicyModeStandard if the workspace has no row in the cache AND the DB
// is nil (unit test path) — callers that need strict behaviour should
// construct the service with a real DB.
func (s *WorkspacePolicyService) Get(ctx context.Context, workspaceID WorkspaceID) (PolicyMode, error) {
	// Cache fast path
	s.mu.RLock()
	if entry, ok := s.cache[workspaceID]; ok {
		if time.Now().Before(entry.expiresAt) {
			s.mu.RUnlock()
			return entry.mode, nil
		}
	}
	s.mu.RUnlock()

	// Unit test path: no DB configured, return the safe default
	if s.db == nil {
		return PolicyModeStandard, nil
	}

	const q = `SELECT upload_policy_mode FROM workspaces WHERE id = $1`
	var raw string
	err := s.db.QueryRowContext(ctx, q, workspaceID).Scan(&raw)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return PolicyModeStandard, nil
		}
		return "", fmt.Errorf("reading workspace policy mode: %w", err)
	}

	if !IsValidPolicyMode(raw) {
		// Row exists but has an unknown mode — treat as standard and log.
		// This can happen during rollout when a future mode name is introduced
		// on a newer deploy and an older pod reads it.
		return PolicyModeStandard, nil
	}

	mode := PolicyMode(raw)
	s.cacheSet(workspaceID, mode)
	return mode, nil
}

// Set updates the workspace's policy mode and writes an audit event.
// actorID is the admin user making the change. The previous value is captured
// in the audit event's BeforeState for traceability.
func (s *WorkspacePolicyService) Set(
	ctx context.Context,
	workspaceID WorkspaceID,
	mode PolicyMode,
	actorID uuid.UUID,
) error {
	if !IsValidPolicyMode(string(mode)) {
		return fmt.Errorf("invalid policy mode: %q", mode)
	}

	// Capture the previous value for the audit trail. Best-effort — if the
	// Get fails we still proceed with the write so a misconfigured row can
	// be corrected.
	previous, _ := s.Get(ctx, workspaceID)

	if s.db == nil {
		// Test path: update the cache only.
		s.cacheSet(workspaceID, mode)
		s.recordAudit(ctx, workspaceID, previous, mode, actorID)
		return nil
	}

	const q = `UPDATE workspaces SET upload_policy_mode = $1 WHERE id = $2`
	result, err := s.db.ExecContext(ctx, q, string(mode), workspaceID)
	if err != nil {
		return fmt.Errorf("updating workspace policy mode: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return fmt.Errorf("workspace not found: %s", workspaceID)
	}

	// Invalidate the cache so the next Get() hits the DB for the fresh value
	// (or use cacheSet to proactively store the new value — we choose the
	// latter since we know what we just wrote).
	s.cacheSet(workspaceID, mode)

	s.recordAudit(ctx, workspaceID, previous, mode, actorID)
	return nil
}

// DefaultForTier returns the recommended policy mode for a newly-created
// workspace of the given subscription tier. The upload_policy_mode column
// has a DB default of 'standard'; this helper is for the workspace_service
// Create() path when it wants to upgrade pro/enterprise workspaces at
// creation time.
//
// Philosophy: be generous on the low tier (standard — fewer blocks, fewer
// support tickets), stricter on professional tiers where photographers care
// about original integrity.
func (s *WorkspacePolicyService) DefaultForTier(tier string) PolicyMode {
	switch tier {
	case "pro", "professional", "enterprise", "studio":
		return PolicyModeStrictClientScan
	case "free", "standard", "basic", "":
		return PolicyModeStandard
	}
	return PolicyModeStandard
}

// cacheSet writes a fresh cache entry with the configured TTL.
func (s *WorkspacePolicyService) cacheSet(workspaceID uuid.UUID, mode PolicyMode) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache[workspaceID] = policyCache{
		mode:      mode,
		expiresAt: time.Now().Add(s.cacheTTL),
	}
}

// Invalidate drops the cache entry for a workspace. Used by tests and by
// an (eventual) NATS subscriber that reacts to cross-pod policy changes.
func (s *WorkspacePolicyService) Invalidate(workspaceID uuid.UUID) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.cache, workspaceID)
}

// recordAudit writes a workspace.policy.changed audit event. Silent failure
// is intentional — a broken audit log must not prevent a policy change from
// persisting, since the change itself is already committed.
func (s *WorkspacePolicyService) recordAudit(
	ctx context.Context,
	workspaceID uuid.UUID,
	previous PolicyMode,
	next PolicyMode,
	actorID uuid.UUID,
) {
	if s.auditLog == nil {
		return
	}

	beforeJSON, _ := json.Marshal(map[string]string{"upload_policy_mode": string(previous)})
	afterJSON, _ := json.Marshal(map[string]string{"upload_policy_mode": string(next)})

	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID:      actorID,
		ActorType:    "admin",
		Action:       "workspace.policy.changed",
		ResourceType: "workspace",
		ResourceID:   workspaceID.String(),
		WorkspaceID:  &workspaceID,
		BeforeState:  beforeJSON,
		AfterState:   afterJSON,
		Severity:     "info",
	})
}
