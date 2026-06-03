package service

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S5: Upload scan manifest data types.
//
// Spec: _cobolt-output/latest/planning/feature-prd.md §4.5 (FR-UPS-028 .. 030)
// Spec: _cobolt-output/latest/planning/feature-architecture-delta.md §4.2
// Story: _cobolt-output/latest/planning/stories/47-5-backend-manifest-validation.md
// ─────────────────────────────────────────────────────────────────────────────

// PolicyMode is the workspace-level upload policy mode.
// The service layer validates against this enum; the DB column has no CHECK
// constraint so new modes can be added without a blocking migration.
type PolicyMode string

const (
	// PolicyModeStandard: browser worker required for JPEG/PNG/WebP/GIF.
	// Desktop agent optional. RAW/TIFF/HEIC allowed with lightweight checks.
	// Tier D logs telemetry but does not reject missing manifests.
	PolicyModeStandard PolicyMode = "standard"

	// PolicyModeStrictClientScan: browser worker mandatory.
	// In M16 this also rejects TIFF/HEIC/RAW because the desktop companion
	// is not yet available (deferred to M17). When such a format arrives,
	// ValidateForSessionCreate returns ErrScanDesktopRequired with a user
	// message pointing to the M17 roadmap.
	PolicyModeStrictClientScan PolicyMode = "strict_client_scan"

	// PolicyModeStrictOriginalPreserve: all original-retention uploads require
	// a signed manifest from RawDrive Desktop or CLI. Since neither exists in
	// M16, any upload in this mode with engine="browser-worker" is rejected.
	// Admins can still set the mode; Tier D enforces the fail-closed policy.
	PolicyModeStrictOriginalPreserve PolicyMode = "strict_original_preservation"
)

// ValidPolicyModes returns all allowed policy mode strings.
// Used by admin handlers to validate incoming API payloads.
func ValidPolicyModes() []PolicyMode {
	return []PolicyMode{PolicyModeStandard, PolicyModeStrictClientScan, PolicyModeStrictOriginalPreserve}
}

// IsValidPolicyMode reports whether a string is one of the allowed modes.
func IsValidPolicyMode(s string) bool {
	for _, m := range ValidPolicyModes() {
		if string(m) == s {
			return true
		}
	}
	return false
}

// ScanEngine identifies which component produced a scan manifest.
type ScanEngine string

const (
	ScanEngineBrowserWorker ScanEngine = "browser-worker"
	ScanEngineDesktopAgent  ScanEngine = "desktop-agent" // M17
	ScanEngineCLI           ScanEngine = "cli"           // M17
)

// UploadScanFinding describes one structural or metadata violation detected
// by a local scanner. Findings are passed to the client for display and
// persisted on the asset for later audit.
type UploadScanFinding struct {
	Category string `json:"category"`         // e.g. "appended_payload", "metadata_budget", "polyglot_signature"
	Severity string `json:"severity"`         // "low" | "medium" | "high"
	Offset   *int64 `json:"offset,omitempty"` // optional byte offset where the violation was detected
	Message  string `json:"message"`          // human-readable explanation
}

// UploadScanDimensions is an optional image dimensions block included when
// the client performed a decode sanity check.
type UploadScanDimensions struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

// UploadScanManifest is the canonical scan manifest produced by a local
// scanner (browser worker or desktop agent) and attached to TUS session create.
// The backend Tier D service validates this structure before the session is
// created and again at finalize time (hash verification).
//
// Field order matches the JSON schema defined in feature-architecture-delta.md
// §4.2 so canonical JSON (sorted keys) signing stays stable across clients.
type UploadScanManifest struct {
	PolicyVersion  string                `json:"policy_version"`
	Engine         ScanEngine            `json:"engine"`
	EngineVersion  string                `json:"engine_version"`
	FileName       string                `json:"file_name"`
	DeclaredType   string                `json:"declared_type"`
	DetectedFormat string                `json:"detected_format"`
	SHA256         string                `json:"sha256"`
	SizeBytes      int64                 `json:"size_bytes"`
	Decision       string                `json:"decision"` // "pass" | "block" | "needs_desktop_scan"
	RiskScore      float64               `json:"risk_score"`
	Findings       []UploadScanFinding   `json:"findings"`
	Dimensions     *UploadScanDimensions `json:"dimensions,omitempty"`

	// Desktop-only fields (absent for browser-worker manifests).
	DeviceID *uuid.UUID `json:"device_id,omitempty"`
}

// UploadPolicyVersion mirrors a row from the upload_policy_versions catalog
// table. The catalog is seeded in migration 054 and maintained by super-admins.
type UploadPolicyVersion struct {
	PolicyVersion string     `json:"policy_version"`
	PolicyJSON    []byte     `json:"policy_json"`
	PublishedAt   time.Time  `json:"published_at"`
	RevokedAt     *time.Time `json:"revoked_at,omitempty"`
	MaxAgeDays    int        `json:"max_age_days"`
	Notes         string     `json:"notes,omitempty"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Sentinel errors returned by UploadManifestValidation implementations.
// Handlers use errors.Is() to map these to precise HTTP status codes and
// user-facing error strings (see feature-architecture-delta.md §7.1).
// ─────────────────────────────────────────────────────────────────────────────

var (
	// ErrScanManifestRequired: workspace is in a mandatory policy mode and
	// the request body contained no scan_manifest.
	ErrScanManifestRequired = errors.New("SCAN_MANIFEST_REQUIRED")

	// ErrScanManifestInvalid: manifest is present but missing required fields
	// or contains malformed values.
	ErrScanManifestInvalid = errors.New("SCAN_MANIFEST_INVALID")

	// ErrScanPolicyStale: manifest references a policy_version that has been
	// revoked or is older than the catalog's max_age_days.
	ErrScanPolicyStale = errors.New("SCAN_POLICY_STALE")

	// ErrScanDecisionBlock: client scanner already decided decision=block.
	ErrScanDecisionBlock = errors.New("SCAN_DECISION_BLOCK")

	// ErrScanSignatureInvalid: desktop manifest signature verification failed.
	// Not used in M16 (no desktop engine); reserved for M17 E56.
	ErrScanSignatureInvalid = errors.New("SCAN_SIGNATURE_INVALID")

	// ErrScanEngineNotAllowed: the manifest engine is not permitted for this
	// format under the workspace's policy mode.
	ErrScanEngineNotAllowed = errors.New("SCAN_ENGINE_NOT_ALLOWED")

	// ErrScanDesktopRequired: M16-specific error returned when a strict mode
	// needs the desktop companion (TIFF/HEIC/RAW) but M17 hasn't shipped it.
	// The error message includes "RawDrive Desktop coming in M17" so users
	// get a clear explanation rather than a cryptic rejection.
	ErrScanDesktopRequired = errors.New("SCAN_DESKTOP_REQUIRED")

	// ErrScanHashMismatch: finalize-time SHA-256 of the uploaded bytes does
	// not match manifest.sha256 — possible tamper or corruption.
	ErrScanHashMismatch = errors.New("SCAN_HASH_MISMATCH")

	// ErrScanNormalizedUploadNotAllowed: safe_normalized_upload was requested
	// in a strict_original_preservation workspace (FR-UPS-038).
	ErrScanNormalizedUploadNotAllowed = errors.New("SCAN_NORMALIZED_UPLOAD_NOT_ALLOWED")
)

// HasRequiredFields reports whether the manifest has all the fields that
// Tier D needs for validation (FR-UPS-028).
func (m *UploadScanManifest) HasRequiredFields() bool {
	if m == nil {
		return false
	}
	return m.PolicyVersion != "" &&
		m.Engine != "" &&
		m.EngineVersion != "" &&
		m.FileName != "" &&
		m.DetectedFormat != "" &&
		m.SHA256 != "" &&
		m.SizeBytes > 0 &&
		m.Decision != ""
}
