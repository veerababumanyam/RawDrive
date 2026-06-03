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
// FR-UPS-033 / AC-UPS-004 + FMT-1 / H5: strict_client_scan and the
// server-decodable families.
//
// Originally (M16) TIFF/HEIC/RAW all returned ErrScanDesktopRequired because
// the server could not decode them. FMT-1 / H5 added a server-side
// CompositeDecoder, so the families it can decode now pass session-create
// (accepted, server processes them). Only families OUTSIDE the decoder's
// capability still require a desktop scanner.
// ─────────────────────────────────────────────────────────────────────────────

func TestValidateForSessionCreate_StrictClientScan_Tiff_Accepted(t *testing.T) {
	v := newValidatorEnforced(&stubCatalog{})
	m := validManifest()
	m.DetectedFormat = "tiff"
	m.FileName = "scan.tiff"
	err := v.ValidateForSessionCreate(context.Background(), PolicyModeStrictClientScan, m)
	if err != nil {
		t.Fatalf("expected TIFF to be accepted in strict mode (server-decodable, FMT-1/H5), got %v", err)
	}
}

func TestValidateForSessionCreate_StrictClientScan_Heic_Accepted(t *testing.T) {
	v := newValidatorEnforced(&stubCatalog{})
	m := validManifest()
	m.DetectedFormat = "heic"
	err := v.ValidateForSessionCreate(context.Background(), PolicyModeStrictClientScan, m)
	if err != nil {
		t.Fatalf("expected HEIC to be accepted in strict mode (server-decodable, FMT-1/H5), got %v", err)
	}
}

func TestValidateForSessionCreate_StrictClientScan_DecodableRaw_Accepted(t *testing.T) {
	for _, format := range []string{"cr2", "cr3", "nef", "arw", "dng", "rw2", "raf", "orf", "avif"} {
		t.Run(format, func(t *testing.T) {
			v := newValidatorEnforced(&stubCatalog{})
			m := validManifest()
			m.DetectedFormat = format
			err := v.ValidateForSessionCreate(context.Background(), PolicyModeStrictClientScan, m)
			if err != nil {
				t.Fatalf("expected server-decodable %s to be accepted in strict mode, got %v", format, err)
			}
		})
	}
}

func TestValidateForSessionCreate_StrictClientScan_NonDecodableRaw_DesktopRequired(t *testing.T) {
	// Families the CompositeDecoder cannot handle still require a desktop agent.
	for _, format := range []string{"crw", "nrw", "arq", "gpr", "rwl"} {
		t.Run(format, func(t *testing.T) {
			v := newValidatorEnforced(&stubCatalog{})
			m := validManifest()
			m.DetectedFormat = format
			err := v.ValidateForSessionCreate(context.Background(), PolicyModeStrictClientScan, m)
			if !errors.Is(err, ErrScanDesktopRequired) {
				t.Fatalf("expected ErrScanDesktopRequired for non-decodable %s in strict mode, got %v", format, err)
			}
		})
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

// FMT-1 / H5: server-side decode (CompositeDecoder) now handles the
// HEIC/RAW/TIFF/AVIF families, so strict_client_scan ACCEPTS the
// server-decodable set instead of demanding a (still-unshipped) desktop agent.
// Only formats outside the decoder's capability (e.g. Sony ARQ, GoPro GPR,
// CRW) stay rejected. The non-image security boundary is unchanged — it lives
// in SniffImageFormat at finalize, not in this allowlist.
func TestIsEngineAllowedForFormat_StrictClientScan_ServerDecodableAllowed(t *testing.T) {
	for _, f := range []string{"tiff", "heic", "heif", "avif", "cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "rw2"} {
		if !IsEngineAllowedForFormat(ScanEngineBrowserWorker, f, PolicyModeStrictClientScan) {
			t.Errorf("strict_client_scan should ACCEPT server-decodable %s (FMT-1/H5)", f)
		}
	}
	// These RAW families are NOT in the CompositeDecoder's dispatch set, so the
	// relaxation must NOT accept them — they still need a desktop scanner.
	for _, f := range []string{"arq", "gpr", "crw", "nrw", "rwl", "pef", "srw", "x3f"} {
		if IsEngineAllowedForFormat(ScanEngineBrowserWorker, f, PolicyModeStrictClientScan) {
			t.Errorf("strict_client_scan must still REJECT non-server-decodable %s", f)
		}
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

// FMT-1 / H5: IsServerDecodableFormat is the single source of truth for the
// relaxation paths and MUST stay in lock-step with CompositeDecoder.Decode.
func TestIsServerDecodableFormat(t *testing.T) {
	decodable := []string{
		"jpeg", "png", "gif", "tiff", "webp",
		"heic", "heif", "avif",
		"cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "rw2",
		// alias normalization
		"jpg", "tif",
	}
	for _, f := range decodable {
		if !IsServerDecodableFormat(f) {
			t.Errorf("expected %q to be server-decodable", f)
		}
	}
	notDecodable := []string{
		"", "crw", "nrw", "arq", "gpr", "rwl", "pef", "srw", "x3f",
		"pdf", "zip", "svg", "html", "bmp", "unknown",
	}
	for _, f := range notDecodable {
		if IsServerDecodableFormat(f) {
			t.Errorf("expected %q to NOT be server-decodable", f)
		}
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
