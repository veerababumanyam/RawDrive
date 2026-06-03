package handler_test

import (
	"bytes"
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

// ─── FMT-1 / H5: HEIC/RAW accepted at finalize; polyglots still rejected ──────

// newHandlerNoValidator builds a handler with NO validation service wired, so
// verifyUploadBytesAtFinalize takes the content-type-driven byte-check default
// branch (the path H5 relaxed) rather than the manifest path.
func newHandlerNoValidator() *handler.ChunkedUploadHandler {
	return handler.NewChunkedUploadHandler(nil, nil, nil, nil)
}

// heicHead is a minimal valid ISO-BMFF "ftyp" box with the "heic" major brand:
// [size=0x18][ftyp][heic][minor][compat...]. SniffImageFormat recognizes this
// as "heic" (a server-decodable family).
var heicHead = []byte{
	0x00, 0x00, 0x00, 0x18, 'f', 't', 'y', 'p', 'h', 'e', 'i', 'c',
	0x00, 0x00, 0x00, 0x00, 'm', 'i', 'f', '1', 'h', 'e', 'i', 'c',
}

// cr2Head is a Canon CR2 header: TIFF little-endian (II 2A 00 ...) with "CR" at
// offset 8. SniffImageFormat returns "cr2".
var cr2Head = []byte{
	'I', 'I', 0x2A, 0x00, 0x10, 0x00, 0x00, 0x00, 'C', 'R', 0x02, 0x00,
}

// tiffHead is a plain little-endian TIFF (DNG and several RAW families share
// this container). SniffImageFormat returns the generic "tiff" token.
var tiffHead = []byte{'I', 'I', 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00}

// pdfPolyglot is a PDF declared as image/heic — the classic polyglot attack the
// security boundary must reject regardless of the relaxed format gate.
var pdfPolyglot = append([]byte("%PDF-1.7\n"), bytes.Repeat([]byte{0x20}, 32)...)

func TestVerifyUploadBytesAtFinalize_Heic_NoManifest_Accepted(t *testing.T) {
	h := newHandlerNoValidator()
	err := handler.VerifyUploadBytesAtFinalizeForTest(h, context.Background(), "image/heic", heicHead, heicHead)
	assert.NoError(t, err, "HEIC must finalize without a manifest now that server decode exists (FMT-1/H5)")
	assert.NotErrorIs(t, err, service.ErrScanManifestRequired,
		"HEIC must NOT fail closed with ErrScanManifestRequired anymore")
}

func TestVerifyUploadBytesAtFinalize_RawCR2_NoManifest_Accepted(t *testing.T) {
	h := newHandlerNoValidator()
	err := handler.VerifyUploadBytesAtFinalizeForTest(h, context.Background(), "image/x-canon-cr2", cr2Head, cr2Head)
	assert.NoError(t, err, "Canon CR2 RAW must finalize without a manifest (FMT-1/H5)")
}

func TestVerifyUploadBytesAtFinalize_Dng_NoManifest_Accepted(t *testing.T) {
	h := newHandlerNoValidator()
	// DNG is declared via its content type but sniffs to the generic tiff family.
	err := handler.VerifyUploadBytesAtFinalizeForTest(h, context.Background(), "image/x-adobe-dng", tiffHead, tiffHead)
	assert.NoError(t, err, "DNG (tiff-family) RAW must finalize without a manifest (FMT-1/H5)")
}

func TestVerifyUploadBytesAtFinalize_Jpeg_Unchanged(t *testing.T) {
	h := newHandlerNoValidator()
	// Valid JPEG: SOI FFD8FF in head, EOI FFD9 in tail. Behavior unchanged.
	head := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F'}
	tail := []byte{0x00, 0x00, 0xFF, 0xD9}
	err := handler.VerifyUploadBytesAtFinalizeForTest(h, context.Background(), "image/jpeg", head, tail)
	assert.NoError(t, err, "well-formed JPEG must still finalize (legacy path unchanged)")
}

func TestVerifyUploadBytesAtFinalize_PdfPolyglot_StillRejected(t *testing.T) {
	h := newHandlerNoValidator()
	// A PDF masquerading as image/heic must STILL be rejected: the sniffer's
	// non-image hard-reject runs from the actual stored bytes, not the
	// client-declared content type. This is the security-boundary guard.
	err := handler.VerifyUploadBytesAtFinalizeForTest(h, context.Background(), "image/heic", pdfPolyglot, pdfPolyglot)
	require.Error(t, err, "a PDF declared as HEIC must be rejected at finalize")
	assert.ErrorIs(t, err, service.ErrScanManifestRequired,
		"polyglot must fail closed (sniffer rejects non-image; gate stays ErrScanManifestRequired)")
}

func TestVerifyUploadBytesAtFinalize_NonDecodableImage_StillRejected(t *testing.T) {
	h := newHandlerNoValidator()
	// Sony ARQ (declared) carrying TIFF-family bytes: the byte-sniff yields the
	// generic "tiff" token which IS decodable, so this would actually be
	// accepted. To prove the decodable-gate, feed a recognized-but-NOT-decodable
	// payload by claiming a server-decodable content type while the bytes are an
	// unrecognized container — the sniffer returns ("", false) → reject.
	garbage := bytes.Repeat([]byte{0xAB, 0xCD, 0xEF, 0x01}, 16)
	err := handler.VerifyUploadBytesAtFinalizeForTest(h, context.Background(), "image/heic", garbage, garbage)
	require.Error(t, err, "unrecognized bytes must be rejected even under a decodable content type")
	assert.ErrorIs(t, err, service.ErrScanManifestRequired)
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
