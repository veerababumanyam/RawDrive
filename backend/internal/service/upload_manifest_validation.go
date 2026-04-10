package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S5: Upload manifest validation service (Tier D — backend).
//
// This is the Round 1 skeleton: just enough structure that Round 1 unit tests
// can exercise the policy mode matrix, required-field checks, and error codes.
// Full enforcement (hash verification, cheap header/trailer spot-check, engine
// allowlist, audit event emission) lands in Round 2.
//
// Spec: feature-prd.md §4.4 (FR-UPS-021..027)
// Spec: feature-architecture-delta.md §4 (Tier D backend)
// Story: _cobolt-output/latest/planning/stories/47-5-backend-manifest-validation.md
// ─────────────────────────────────────────────────────────────────────────────

// WorkspaceID is a typed alias used by the validation service. The existing
// codebase passes uuid.UUID directly; this alias documents intent at call sites.
type WorkspaceID = uuid.UUID

// UploadManifestValidation gates every incoming upload session against the
// workspace's policy mode. It is the true trust boundary (Tier D) — the
// browser-side worker is a fast filter, not a security boundary.
type UploadManifestValidation interface {
	// ValidateForSessionCreate runs BEFORE a TUS session is created.
	// Returns nil on success or one of the sentinel errors in upload_scan_types.go.
	// The caller passes the workspace policy mode; the validator does not
	// re-fetch it to avoid a double DB round-trip per upload.
	ValidateForSessionCreate(ctx context.Context, mode PolicyMode, manifest *UploadScanManifest) error

	// VerifyAgainstBytes runs AFTER the client has uploaded all bytes, at
	// finalize time. Re-hashes the temp file and compares against manifest.sha256.
	// Returns ErrScanHashMismatch on mismatch. (Round 2 adds cheap structural
	// spot-check of header/trailer bytes.)
	VerifyAgainstBytes(ctx context.Context, manifestHash string, tempFilePath string) error

	// IsPolicyVersionValid checks the policy_version catalog. Used by
	// ValidateForSessionCreate and also by the GET /upload-policy/versions
	// handler to surface active versions to the desktop agent.
	IsPolicyVersionValid(ctx context.Context, policyVersion string) (bool, error)

	// WorkspacePolicyMode reads the workspace's configured policy mode.
	// Cached via WorkspacePolicyService (see workspace_policy_service.go)
	// to stay off the hot path.
	WorkspacePolicyMode(ctx context.Context, ws WorkspaceID) (PolicyMode, error)
}

// PolicyCatalog is the minimal interface the validator needs over the
// upload_policy_versions table. Real implementation lives in upload_policy_catalog.go.
type PolicyCatalog interface {
	IsValid(ctx context.Context, policyVersion string) (bool, error)
}

// WorkspacePolicyReader is the minimal interface for looking up a workspace's
// configured policy mode. Implemented by WorkspacePolicyService.
type WorkspacePolicyReader interface {
	Get(ctx context.Context, workspaceID WorkspaceID) (PolicyMode, error)
}

// uploadManifestValidationImpl is the production implementation.
type uploadManifestValidationImpl struct {
	catalog        PolicyCatalog
	workspacePolicy WorkspacePolicyReader
	auditLog       *AuditLogService // may be nil in unit tests
	// enforceMode controls whether the validator returns errors (enforced)
	// or only logs violations (telemetry-only). Phase 1 of the rollout
	// uses telemetry-only so operators can observe the real-world reject
	// rate before flipping the switch. Default is telemetry-only.
	enforceMode bool
}

// NewUploadManifestValidation constructs the service.
// Callers pass the policy catalog + workspace policy reader + audit log.
// The enforceMode flag can be wired to an env var (TIER_D_ENFORCE_MODE)
// or to a per-workspace setting in a future story.
func NewUploadManifestValidation(
	catalog PolicyCatalog,
	workspacePolicy WorkspacePolicyReader,
	auditLog *AuditLogService,
	enforceMode bool,
) UploadManifestValidation {
	return &uploadManifestValidationImpl{
		catalog:         catalog,
		workspacePolicy: workspacePolicy,
		auditLog:        auditLog,
		enforceMode:     enforceMode,
	}
}

// ValidateForSessionCreate applies the policy mode rules to the incoming manifest.
// The rule matrix matches FR-UPS-032 / FR-UPS-033 / FR-UPS-034 from feature-prd.md.
//
// M16 scope note: because the desktop companion has not shipped (M17), any rule
// that would normally require engine=desktop-agent returns ErrScanDesktopRequired
// with a descriptive message instead of pretending the desktop path works.
func (s *uploadManifestValidationImpl) ValidateForSessionCreate(
	ctx context.Context,
	mode PolicyMode,
	manifest *UploadScanManifest,
) error {
	// Rule 1: missing manifest
	// Standard mode is telemetry-only for missing manifests.
	// Strict modes require a manifest unconditionally.
	if manifest == nil {
		if mode == PolicyModeStandard {
			return nil // telemetry-only — logged, not rejected
		}
		if s.enforceMode {
			return ErrScanManifestRequired
		}
		// Still in telemetry-only rollout phase: log but do not reject.
		return nil
	}

	// Rule 2: required fields
	if !manifest.HasRequiredFields() {
		if s.enforceMode {
			return ErrScanManifestInvalid
		}
		return nil
	}

	// Rule 3: policy version freshness
	if s.catalog != nil {
		ok, err := s.catalog.IsValid(ctx, manifest.PolicyVersion)
		if err != nil {
			return fmt.Errorf("checking policy version: %w", err)
		}
		if !ok {
			if s.enforceMode {
				return ErrScanPolicyStale
			}
			return nil
		}
	}

	// Rule 4: client scanner already blocked
	if manifest.Decision == "block" {
		return ErrScanDecisionBlock
	}

	// Rule 5: engine allowed for this format in this mode
	if !IsEngineAllowedForFormat(manifest.Engine, manifest.DetectedFormat, mode) {
		// Distinguish the "desktop required but not shipped yet" case so the
		// user gets a clear M17 message instead of a cryptic rejection.
		if isDesktopRequiredFormat(manifest.DetectedFormat) && mode != PolicyModeStandard {
			if s.enforceMode {
				return ErrScanDesktopRequired
			}
			return nil
		}
		if s.enforceMode {
			return ErrScanEngineNotAllowed
		}
		return nil
	}

	// Rule 6: signature verification is a Round 2 / M17 concern.
	// Browser-worker manifests have no signature; desktop-agent manifests
	// are not accepted in M16 (covered by Rule 5 above).

	return nil
}

// VerifyAgainstBytes is implemented in upload_manifest_verify.go (Round 2).

// IsPolicyVersionValid delegates to the catalog. Kept as a thin wrapper so
// handlers can query the catalog without importing the catalog package directly.
func (s *uploadManifestValidationImpl) IsPolicyVersionValid(
	ctx context.Context,
	policyVersion string,
) (bool, error) {
	if s.catalog == nil {
		return false, fmt.Errorf("policy catalog not configured")
	}
	return s.catalog.IsValid(ctx, policyVersion)
}

// WorkspacePolicyMode delegates to the workspace policy reader.
func (s *uploadManifestValidationImpl) WorkspacePolicyMode(
	ctx context.Context,
	ws WorkspaceID,
) (PolicyMode, error) {
	if s.workspacePolicy == nil {
		return PolicyModeStandard, nil
	}
	return s.workspacePolicy.Get(ctx, ws)
}

// Engine allowlist, isBrowserWorkerFormat, and isDesktopRequiredFormat live in
// engine_allowlist.go (same package, cross-file same-package calls are fine).
