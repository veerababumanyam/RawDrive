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

// sharedPolicyCache is the optional cross-node backing for the upload-policy
// cache. When wired (Valkey, via WorkspacePolicyService.WithSharedCache in
// main.go) it REPLACES the in-process map as the cache source of truth, so a
// policy change (Set) or an invalidation on one app node is immediately visible
// to all nodes — killing the per-node staleness of the in-process cache
// (.42 ≠ .44, up to the 5-minute TTL). nil = in-process only (single node / no
// Valkey). All ops are best-effort: a cache error never fails the caller, it
// just degrades to a DB read. This mirrors the storage-analytics shared-cache
// seam (sharedAnalyticsCache).
type sharedPolicyCache interface {
	Get(ctx context.Context, key string) ([]byte, bool, error)
	Set(ctx context.Context, key string, val []byte, ttl time.Duration)
	Del(ctx context.Context, key string)
}

// policySharedCacheOpTimeout bounds each shared-cache round trip so a slow or
// unreachable Valkey can never stall a policy read/write.
const policySharedCacheOpTimeout = 2 * time.Second

// policyCacheKey is the shared-backing key for a workspace's policy mode. The
// namespace keeps it from colliding with other shared caches on the same Valkey.
func policyCacheKey(workspaceID uuid.UUID) string {
	return "workspace:policy:" + workspaceID.String()
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

	// shared is the optional cross-node backing. When non-nil every cache op
	// routes to it instead of the in-process map, so all app nodes share one
	// cache and a Set/Invalidate on either node is seen by the others.
	shared sharedPolicyCache
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

// WithAuditLog injects an audit log service after construction. Used by
// cmd/api/main.go to wire the service before auditLogSvc is constructed
// (the latter depends on auditLogRepo which is initialized in the admin
// block, well below where this service is built). Returns the service for
// chainable construction. Pass nil to disable audit emission.
//
// M16-BUG-02 fix: prior to this setter, main.go passed nil for auditLog
// and the comment said "wired below after auditLogSvc" but the wiring
// never happened — every workspace.policy.changed audit was silently
// dropped because the service held a nil recorder.
func (s *WorkspacePolicyService) WithAuditLog(auditLog *AuditLogService) *WorkspacePolicyService {
	if auditLog != nil {
		s.auditLog = auditLog
	}
	return s
}

// WithSharedCache wires a cross-node (Valkey) backing for the policy cache.
// main.go calls this during bootstrap when VALKEY_URL is set, so both app nodes
// share one cache and a policy change (Set) or invalidation on either node is
// seen by the other — eliminating the in-process cache's per-node staleness
// (a policy change on .42 was invisible to .44 until the 5-minute TTL expired).
// Passing nil keeps the in-process cache. Returns the same pointer so the call
// chains. Mirrors StorageAccounting.WithSharedCache.
func (s *WorkspacePolicyService) WithSharedCache(c sharedPolicyCache) *WorkspacePolicyService {
	if c != nil {
		s.shared = c
	}
	return s
}

// Get returns the workspace's configured policy mode. Falls back to
// PolicyModeStandard if the workspace has no row in the cache AND the DB
// is nil (unit test path) — callers that need strict behaviour should
// construct the service with a real DB.
func (s *WorkspacePolicyService) Get(ctx context.Context, workspaceID WorkspaceID) (PolicyMode, error) {
	// Cache fast path. When a shared (Valkey) backing is wired it is the cache
	// source of truth so all nodes agree; otherwise fall back to the in-process
	// map. A shared-cache hit short-circuits the DB read just like the in-proc
	// path; a shared-cache miss/error degrades to a DB read (best-effort).
	if mode, ok := s.cacheGet(ctx, workspaceID); ok {
		return mode, nil
	}

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

// cacheGet returns the cached policy mode for a workspace if present and live.
// When a shared (Valkey) backing is wired it consults that — so every app node
// reads the same value — falling back to the in-process map otherwise. A
// shared-cache error or miss is reported as a clean miss so the caller degrades
// to a DB read; a Valkey outage never fails a policy read.
func (s *WorkspacePolicyService) cacheGet(ctx context.Context, workspaceID uuid.UUID) (PolicyMode, bool) {
	if s.shared != nil {
		opCtx, cancel := context.WithTimeout(ctx, policySharedCacheOpTimeout)
		defer cancel()
		raw, ok, err := s.shared.Get(opCtx, policyCacheKey(workspaceID))
		if err != nil || !ok {
			return "", false // best-effort: a cache error degrades to a DB read
		}
		var mode PolicyMode
		if json.Unmarshal(raw, &mode) != nil || !IsValidPolicyMode(string(mode)) {
			return "", false
		}
		return mode, true
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	entry, ok := s.cache[workspaceID]
	if !ok || !time.Now().Before(entry.expiresAt) {
		return "", false
	}
	return entry.mode, true
}

// cacheSet writes a fresh cache entry with the configured TTL. When a shared
// (Valkey) backing is wired the write goes there instead of the in-process map,
// so the new mode is immediately visible to every app node.
func (s *WorkspacePolicyService) cacheSet(workspaceID uuid.UUID, mode PolicyMode) {
	if s.shared != nil {
		raw, err := json.Marshal(mode)
		if err != nil {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), policySharedCacheOpTimeout)
		defer cancel()
		s.shared.Set(ctx, policyCacheKey(workspaceID), raw, s.cacheTTL)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache[workspaceID] = policyCache{
		mode:      mode,
		expiresAt: time.Now().Add(s.cacheTTL),
	}
}

// Invalidate drops the cache entry for a workspace. When a shared (Valkey)
// backing is wired it DELetes the shared key, so a peer app node's next Get
// misses and re-queries the DB — this is what makes a policy change on one node
// visible on the others within seconds instead of after the 5-minute TTL. With
// no shared backing it drops the local in-process entry. Called by tests and by
// the admin policy write path (Set) to keep nodes coherent.
func (s *WorkspacePolicyService) Invalidate(workspaceID uuid.UUID) {
	if s.shared != nil {
		ctx, cancel := context.WithTimeout(context.Background(), policySharedCacheOpTimeout)
		defer cancel()
		s.shared.Del(ctx, policyCacheKey(workspaceID))
		return
	}
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
