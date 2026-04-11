package handler_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// Tests for F-003 and F-004 (audit 2026-04-10):
//   - F-003: the chunked upload finalize path must verify that the actual
//     uploaded bytes match the manifest's declared SHA-256. The helpers
//     (VerifyAgainstBytes + VerifyHeaderTrailer) existed but had no production
//     callsite — M16's "upload abuse screening" was trust-the-client in the
//     live path.
//   - F-004: the verified manifest metadata must be persisted to the asset
//     row so the moderation dashboard and audit trail can reason about it.
//     Schema columns live in migration 053.
//
// These tests exercise verifyManifestAtFinalize + applyScanMetadata directly
// via test seams (handler.VerifyManifestAtFinalizeForTest,
// handler.ApplyScanMetadataForTest) rather than booting the full chunked
// upload pipeline. A full end-to-end integration test that needs real
// AssetRepo + storage is left as a follow-up (see chunked_upload_test.go
// line 44-49 for the existing deferral note).

// SHA-256 of the literal bytes "hello world" (no trailing newline).
const helloWorldSHA256 = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"

// helloWorld is the canonical test payload. F-013 (M17 wave 6) moved the
// F-003 test seam to accept raw bytes instead of a temp file path because
// the direct-R2 rewrite deleted all local-disk staging.
var helloWorld = []byte("hello world")

func newHandlerWithValidator(t *testing.T) *handler.ChunkedUploadHandler {
	t.Helper()
	validator := service.NewUploadManifestValidation(
		nil, // catalog: nil means policy-version checks are skipped
		nil, // workspacePolicy: not used in the finalize path
		nil, // auditLog
		true,
	)
	// nil session store is fine: these tests drive verifyManifestAtFinalize
	// via the export_test.go seam, which never touches the store.
	return handler.NewChunkedUploadHandler(nil, nil, nil, nil).
		WithValidation(validator)
}

// ─── F-003: finalize verification ────────────────────────────────────────────

func TestVerifyManifestAtFinalize_NoManifest_NoOp(t *testing.T) {
	h := newHandlerWithValidator(t)
	err := handler.VerifyManifestAtFinalizeForTest(h, context.Background(), helloWorld, nil)
	assert.NoError(t, err, "nil manifest must be a no-op (legacy upload path)")
}

func TestVerifyManifestAtFinalize_MatchingHash_Succeeds(t *testing.T) {
	h := newHandlerWithValidator(t)

	manifest := &service.UploadScanManifest{
		SHA256: helloWorldSHA256,
		// No DetectedFormat so VerifyHeaderTrailer short-circuits — this
		// isolates the hash check from the format spot-check.
	}

	err := handler.VerifyManifestAtFinalizeForTest(h, context.Background(), helloWorld, manifest)
	assert.NoError(t, err, "matching SHA-256 must succeed")
}

func TestVerifyManifestAtFinalize_HashMismatch_Rejected(t *testing.T) {
	h := newHandlerWithValidator(t)

	manifest := &service.UploadScanManifest{
		// Plausible-looking but wrong hash.
		SHA256: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
	}

	err := handler.VerifyManifestAtFinalizeForTest(h, context.Background(), helloWorld, manifest)
	require.Error(t, err, "mismatched SHA-256 must be rejected")
	assert.ErrorIs(t, err, service.ErrScanHashMismatch,
		"error must unwrap to ErrScanHashMismatch so the handler returns 422")
}

func TestVerifyManifestAtFinalize_EmptyManifestHash_Rejected(t *testing.T) {
	h := newHandlerWithValidator(t)

	manifest := &service.UploadScanManifest{SHA256: ""}

	err := handler.VerifyManifestAtFinalizeForTest(h, context.Background(), helloWorld, manifest)
	require.Error(t, err, "blank manifest hash must be rejected, not silently passed")
	assert.ErrorIs(t, err, service.ErrScanManifestInvalid,
		"blank hash must surface ErrScanManifestInvalid for 422 mapping")
}

func TestVerifyManifestAtFinalize_FormatSpotCheckDetectsCorruption(t *testing.T) {
	h := newHandlerWithValidator(t)
	// These bytes are not a valid JPEG (no FFD8/FFD9 markers) but we claim
	// they are in the manifest. The hash will match — so only the
	// header/trailer spot-check can catch the corruption.
	manifest := &service.UploadScanManifest{
		SHA256:         helloWorldSHA256, // matches — forces hash check to pass
		DetectedFormat: "jpeg",           // forces spot-check to run
	}

	err := handler.VerifyManifestAtFinalizeForTest(h, context.Background(), helloWorld, manifest)
	require.Error(t, err, "corrupt JPEG must fail the header/trailer spot-check")
	assert.ErrorIs(t, err, service.ErrScanHashMismatch,
		"spot-check failure currently surfaces as ErrScanHashMismatch by design")
}

// ─── F-004: scan metadata persistence ────────────────────────────────────────

func TestApplyScanMetadata_NilManifest_NoOp(t *testing.T) {
	asset := &repository.Asset{}
	handler.ApplyScanMetadataForTest(asset, nil)

	assert.Nil(t, asset.UploadScanStatus, "nil manifest must leave scan fields unset")
	assert.Nil(t, asset.UploadScanEngine)
	assert.Nil(t, asset.UploadScanPolicyVersion)
	assert.Nil(t, asset.UploadScanRiskScore)
	assert.Nil(t, asset.UploadScanManifestHash)
	assert.Empty(t, asset.UploadScanFindings)
}

func TestApplyScanMetadata_PopulatesAllFields(t *testing.T) {
	asset := &repository.Asset{}
	manifest := &service.UploadScanManifest{
		PolicyVersion: "v1.2.0",
		Engine:        service.ScanEngineBrowserWorker,
		SHA256:        helloWorldSHA256,
		RiskScore:     0.12,
		Findings: []service.UploadScanFinding{
			{Category: "metadata_budget", Severity: "low", Message: "EXIF larger than 256 KiB"},
		},
	}

	handler.ApplyScanMetadataForTest(asset, manifest)

	require.NotNil(t, asset.UploadScanStatus)
	assert.Equal(t, "passed", *asset.UploadScanStatus,
		"verified manifest must land with status=passed (block is rejected at session-create)")

	require.NotNil(t, asset.UploadScanEngine)
	assert.Equal(t, string(service.ScanEngineBrowserWorker), *asset.UploadScanEngine)

	require.NotNil(t, asset.UploadScanPolicyVersion)
	assert.Equal(t, "v1.2.0", *asset.UploadScanPolicyVersion)

	require.NotNil(t, asset.UploadScanRiskScore)
	assert.InDelta(t, 0.12, *asset.UploadScanRiskScore, 1e-9)

	require.NotNil(t, asset.UploadScanManifestHash)
	assert.Equal(t, helloWorldSHA256, *asset.UploadScanManifestHash)

	require.Len(t, asset.UploadScanFindings, 1)
	finding := asset.UploadScanFindings[0]
	assert.Equal(t, "metadata_budget", finding["category"])
	assert.Equal(t, "low", finding["severity"])
	assert.Equal(t, "EXIF larger than 256 KiB", finding["message"])
}

// Guard against import cycle / silent import drop.
var _ = errors.Is
