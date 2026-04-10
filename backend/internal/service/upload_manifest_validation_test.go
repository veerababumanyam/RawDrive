package service

import (
	"context"
	"errors"
	"testing"
)

// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S5 Round 1 RED tests.
//
// Every test here traces back to a specific FR or AC in feature-prd.md.
// Round 1 exercises the policy mode matrix, required-field checks, and error
// codes WITHOUT needing a real DB or filesystem. The PolicyCatalog is stubbed
// via an interface, and VerifyAgainstBytes is only smoke-tested because the
// real hash comparison is a Round 2 concern.
//
// Coverage target: every sentinel error in upload_scan_types.go is produced
// at least once by a test case below.
// ─────────────────────────────────────────────────────────────────────────────

// stubCatalog is a hand-rolled PolicyCatalog for unit tests. It returns true
// for any policy version in its validSet, false otherwise.
type stubCatalog struct {
	validSet map[string]bool
}

func (s *stubCatalog) IsValid(ctx context.Context, policyVersion string) (bool, error) {
	if s.validSet == nil {
		return policyVersion == "upload-screening/2026-04-10", nil
	}
	return s.validSet[policyVersion], nil
}

// stubWorkspacePolicy always returns the same mode.
type stubWorkspacePolicy struct {
	mode PolicyMode
}

func (s *stubWorkspacePolicy) Get(ctx context.Context, workspaceID WorkspaceID) (PolicyMode, error) {
	return s.mode, nil
}

// newValidatorEnforced constructs a validator in enforce mode (not telemetry-only).
// Round 1 tests use enforce mode so sentinel errors are observable.
func newValidatorEnforced(cat PolicyCatalog) UploadManifestValidation {
	return NewUploadManifestValidation(cat, nil, nil, true)
}

// newValidatorTelemetry constructs a validator in telemetry-only mode —
// violations are logged but never returned as errors.
func newValidatorTelemetry(cat PolicyCatalog) UploadManifestValidation {
	return NewUploadManifestValidation(cat, nil, nil, false)
}

// validManifest returns a pristine browser-worker manifest that should pass
// every Round 1 rule when the policy mode allows browser-worker for JPEG.
func validManifest() *UploadScanManifest {
	return &UploadScanManifest{
		PolicyVersion:  "upload-screening/2026-04-10",
		Engine:         ScanEngineBrowserWorker,
		EngineVersion:  "1.0.0",
		FileName:       "Wedding (42).jpg",
		DeclaredType:   "image/jpeg",
		DetectedFormat: "jpeg",
		SHA256:         "abc123def456",
		SizeBytes:      5242880, // 5 MB
		Decision:       "pass",
		RiskScore:      0.04,
		Findings:       []UploadScanFinding{},
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// FR-UPS-021 / FR-UPS-032: standard mode is lenient on missing manifests
// ─────────────────────────────────────────────────────────────────────────────

func TestValidateForSessionCreate_StandardMode_NoManifest_Allowed(t *testing.T) {
	// FR-UPS-032: in standard mode, a missing manifest is telemetry-only.
	v := newValidatorEnforced(&stubCatalog{})
	err := v.ValidateForSessionCreate(context.Background(), PolicyModeStandard, nil)
	if err != nil {
		t.Fatalf("standard mode should allow missing manifest, got %v", err)
	}
}

func TestValidateForSessionCreate_StandardMode_ValidManifest_Allowed(t *testing.T) {
	v := newValidatorEnforced(&stubCatalog{})
	err := v.ValidateForSessionCreate(context.Background(), PolicyModeStandard, validManifest())
	if err != nil {
		t.Fatalf("standard mode should accept a valid manifest, got %v", err)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// FR-UPS-021 / FR-UPS-033: strict_client_scan requires a manifest
// ─────────────────────────────────────────────────────────────────────────────

func TestValidateForSessionCreate_StrictClientScan_NoManifest_Rejected(t *testing.T) {
	v := newValidatorEnforced(&stubCatalog{})
	err := v.ValidateForSessionCreate(context.Background(), PolicyModeStrictClientScan, nil)
	if !errors.Is(err, ErrScanManifestRequired) {
		t.Fatalf("expected ErrScanManifestRequired, got %v", err)
	}
}

func TestValidateForSessionCreate_StrictClientScan_NoManifest_TelemetryOnly_Allowed(t *testing.T) {
	// In telemetry-only rollout, the same missing manifest does NOT error.
	v := newValidatorTelemetry(&stubCatalog{})
	err := v.ValidateForSessionCreate(context.Background(), PolicyModeStrictClientScan, nil)
	if err != nil {
		t.Fatalf("telemetry mode should not reject, got %v", err)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// FR-UPS-028: manifest required fields
// ─────────────────────────────────────────────────────────────────────────────

func TestValidateForSessionCreate_MissingRequiredFields_Rejected(t *testing.T) {
	v := newValidatorEnforced(&stubCatalog{})
	m := validManifest()
	m.SHA256 = "" // strip a required field
	err := v.ValidateForSessionCreate(context.Background(), PolicyModeStrictClientScan, m)
	if !errors.Is(err, ErrScanManifestInvalid) {
		t.Fatalf("expected ErrScanManifestInvalid, got %v", err)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// FR-UPS-023 / NFR-UPS-010: stale / revoked policy versions
// ─────────────────────────────────────────────────────────────────────────────

func TestValidateForSessionCreate_StalePolicy_Rejected(t *testing.T) {
	cat := &stubCatalog{validSet: map[string]bool{
		"upload-screening/2026-04-10": false, // revoked
	}}
	v := newValidatorEnforced(cat)
	err := v.ValidateForSessionCreate(context.Background(), PolicyModeStrictClientScan, validManifest())
	if !errors.Is(err, ErrScanPolicyStale) {
		t.Fatalf("expected ErrScanPolicyStale, got %v", err)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// FR-UPS-026 / AC-UPS-002: decision=block is always rejected
// ─────────────────────────────────────────────────────────────────────────────

func TestValidateForSessionCreate_BlockDecision_Rejected(t *testing.T) {
	v := newValidatorEnforced(&stubCatalog{})
	m := validManifest()
	m.Decision = "block"
	m.Findings = []UploadScanFinding{
		{Category: "appended_payload", Severity: "high", Message: "bytes after JPEG EOI"},
	}
	err := v.ValidateForSessionCreate(context.Background(), PolicyModeStandard, m)
	if !errors.Is(err, ErrScanDecisionBlock) {
		t.Fatalf("expected ErrScanDecisionBlock, got %v", err)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// FR-UPS-033 / AC-UPS-004: strict_client_scan needs desktop for TIFF/HEIC/RAW
// Since M16 has no desktop, these return ErrScanDesktopRequired (not a generic
// engine-not-allowed) so the UI can show a "RawDrive Desktop coming in M17" message.
// ─────────────────────────────────────────────────────────────────────────────

func TestValidateForSessionCreate_StrictClientScan_Tiff_DesktopRequired(t *testing.T) {
	v := newValidatorEnforced(&stubCatalog{})
	m := validManifest()
	m.DetectedFormat = "tiff"
	m.FileName = "scan.tiff"
	err := v.ValidateForSessionCreate(context.Background(), PolicyModeStrictClientScan, m)
	if !errors.Is(err, ErrScanDesktopRequired) {
		t.Fatalf("expected ErrScanDesktopRequired for TIFF in strict mode, got %v", err)
	}
}

func TestValidateForSessionCreate_StrictClientScan_Heic_DesktopRequired(t *testing.T) {
	v := newValidatorEnforced(&stubCatalog{})
	m := validManifest()
	m.DetectedFormat = "heic"
	err := v.ValidateForSessionCreate(context.Background(), PolicyModeStrictClientScan, m)
	if !errors.Is(err, ErrScanDesktopRequired) {
		t.Fatalf("expected ErrScanDesktopRequired for HEIC in strict mode, got %v", err)
	}
}

func TestValidateForSessionCreate_StrictClientScan_Raw_DesktopRequired(t *testing.T) {
	v := newValidatorEnforced(&stubCatalog{})
	m := validManifest()
	m.DetectedFormat = "cr2"
	err := v.ValidateForSessionCreate(context.Background(), PolicyModeStrictClientScan, m)
	if !errors.Is(err, ErrScanDesktopRequired) {
		t.Fatalf("expected ErrScanDesktopRequired for CR2 in strict mode, got %v", err)
	}
}

func TestValidateForSessionCreate_StrictClientScan_Jpeg_BrowserWorker_Passes(t *testing.T) {
	v := newValidatorEnforced(&stubCatalog{})
	err := v.ValidateForSessionCreate(context.Background(), PolicyModeStrictClientScan, validManifest())
	if err != nil {
		t.Fatalf("strict_client_scan should accept browser-worker JPEG, got %v", err)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// FR-UPS-034 / AC-UPS-007: strict_original_preservation rejects browser-only
// ─────────────────────────────────────────────────────────────────────────────

func TestValidateForSessionCreate_StrictOriginalPreservation_BrowserWorker_Rejected(t *testing.T) {
	v := newValidatorEnforced(&stubCatalog{})
	err := v.ValidateForSessionCreate(context.Background(), PolicyModeStrictOriginalPreserve, validManifest())
	// Expect either ErrScanEngineNotAllowed or ErrScanDesktopRequired; both are acceptable
	// because JPEG is not in the "desktop required" list but the mode itself requires desktop.
	if err == nil {
		t.Fatal("strict_original_preservation should reject browser-worker")
	}
	if !errors.Is(err, ErrScanEngineNotAllowed) && !errors.Is(err, ErrScanDesktopRequired) {
		t.Fatalf("expected ErrScanEngineNotAllowed or ErrScanDesktopRequired, got %v", err)
	}
}

// Note: Real hash verification tests (FR-UPS-022) live in
// upload_manifest_verify_test.go, which covers HashMatches, HashMismatch,
// HashCaseInsensitive, MissingFile, and EmptyFile paths against real temp
// files via t.TempDir(). The two Round-1-stub tests that used to live here
// were removed when upload_manifest_verify.go landed — they passed a bogus
// /tmp/foo path which only worked by accident on Linux and broke Windows CI.

// ─────────────────────────────────────────────────────────────────────────────
// Engine allowlist matrix — exhaustive coverage of (mode, engine, format) triples
// ─────────────────────────────────────────────────────────────────────────────

func TestIsEngineAllowedForFormat_StandardMode_AllowsAnything(t *testing.T) {
	if !IsEngineAllowedForFormat(ScanEngineBrowserWorker, "jpeg", PolicyModeStandard) {
		t.Error("standard should allow browser-worker jpeg")
	}
	if !IsEngineAllowedForFormat(ScanEngineBrowserWorker, "tiff", PolicyModeStandard) {
		t.Error("standard should allow browser-worker tiff (best effort)")
	}
	if !IsEngineAllowedForFormat(ScanEngineDesktopAgent, "heic", PolicyModeStandard) {
		t.Error("standard should allow desktop-agent heic")
	}
}

func TestIsEngineAllowedForFormat_StrictClientScan_BrowserWorkerJpegAllowed(t *testing.T) {
	if !IsEngineAllowedForFormat(ScanEngineBrowserWorker, "jpeg", PolicyModeStrictClientScan) {
		t.Error("strict_client_scan should allow browser-worker JPEG")
	}
	if !IsEngineAllowedForFormat(ScanEngineBrowserWorker, "png", PolicyModeStrictClientScan) {
		t.Error("strict_client_scan should allow browser-worker PNG")
	}
	if !IsEngineAllowedForFormat(ScanEngineBrowserWorker, "webp", PolicyModeStrictClientScan) {
		t.Error("strict_client_scan should allow browser-worker WebP")
	}
	if !IsEngineAllowedForFormat(ScanEngineBrowserWorker, "gif", PolicyModeStrictClientScan) {
		t.Error("strict_client_scan should allow browser-worker GIF")
	}
}

func TestIsEngineAllowedForFormat_StrictClientScan_BrowserWorkerTiffRejected(t *testing.T) {
	// TIFF needs desktop in strict mode; desktop doesn't exist in M16 → rejected.
	if IsEngineAllowedForFormat(ScanEngineBrowserWorker, "tiff", PolicyModeStrictClientScan) {
		t.Error("strict_client_scan should REJECT browser-worker TIFF in M16 (no desktop yet)")
	}
	if IsEngineAllowedForFormat(ScanEngineBrowserWorker, "heic", PolicyModeStrictClientScan) {
		t.Error("strict_client_scan should REJECT browser-worker HEIC in M16")
	}
	if IsEngineAllowedForFormat(ScanEngineBrowserWorker, "cr2", PolicyModeStrictClientScan) {
		t.Error("strict_client_scan should REJECT browser-worker CR2 in M16")
	}
}

func TestIsEngineAllowedForFormat_StrictOriginalPreservation_RejectsBrowserWorkerAlways(t *testing.T) {
	// Even JPEG is rejected because strict_original_preservation needs signed desktop/cli manifests.
	if IsEngineAllowedForFormat(ScanEngineBrowserWorker, "jpeg", PolicyModeStrictOriginalPreserve) {
		t.Error("strict_original_preservation should REJECT browser-worker for all formats in M16")
	}
	if IsEngineAllowedForFormat(ScanEngineBrowserWorker, "tiff", PolicyModeStrictOriginalPreserve) {
		t.Error("strict_original_preservation should REJECT browser-worker TIFF")
	}
}

func TestIsEngineAllowedForFormat_UnknownMode_FailsClosed(t *testing.T) {
	if IsEngineAllowedForFormat(ScanEngineBrowserWorker, "jpeg", PolicyMode("bogus")) {
		t.Error("unknown policy mode must fail closed")
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Required-field helper
// ─────────────────────────────────────────────────────────────────────────────

func TestUploadScanManifest_HasRequiredFields_Valid(t *testing.T) {
	if !validManifest().HasRequiredFields() {
		t.Error("valid manifest should have all required fields")
	}
}

func TestUploadScanManifest_HasRequiredFields_Nil(t *testing.T) {
	var m *UploadScanManifest
	if m.HasRequiredFields() {
		t.Error("nil manifest should not have required fields")
	}
}

func TestUploadScanManifest_HasRequiredFields_MissingSHA(t *testing.T) {
	m := validManifest()
	m.SHA256 = ""
	if m.HasRequiredFields() {
		t.Error("manifest without sha256 should be invalid")
	}
}

func TestUploadScanManifest_HasRequiredFields_MissingFileName(t *testing.T) {
	m := validManifest()
	m.FileName = ""
	if m.HasRequiredFields() {
		t.Error("manifest without file_name should be invalid")
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy mode validation helper
// ─────────────────────────────────────────────────────────────────────────────

func TestIsValidPolicyMode(t *testing.T) {
	cases := map[string]bool{
		"standard":                     true,
		"strict_client_scan":           true,
		"strict_original_preservation": true,
		"":                             false,
		"bogus":                        false,
		"Standard":                     false, // case-sensitive
	}
	for input, expected := range cases {
		if got := IsValidPolicyMode(input); got != expected {
			t.Errorf("IsValidPolicyMode(%q) = %v, want %v", input, got, expected)
		}
	}
}
