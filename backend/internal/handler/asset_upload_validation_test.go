package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
)

// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S5 Round 3 — Asset handler validation gate tests.
//
// Covers the direct multipart upload path POST /api/v1/assets. Mirrors the
// chunked upload validation tests (chunked_upload_test.go) — this handler is
// the second of two upload entry points and must enforce the same Tier D
// rules, otherwise an attacker can bypass scanning by choosing the direct
// multipart path instead of the chunked path.
//
// Stub policy reader and the same-package test helper are reused from
// chunked_upload_test.go (both files live in package handler_test).
//
// DEFERRED (same reason as chunked_upload happy path):
//   TestAssetUpload_WithValidManifest_Succeeds — requires a full upload
//   pipeline with real ExifService + AssetRepo + storage. Round 3 covers
//   the rejection paths; the happy-path integration test lands alongside
//   the full upload pipeline test rig in Round 5.
// ─────────────────────────────────────────────────────────────────────────────

// newAssetUploadRequest builds a multipart/form-data POST to /api/v1/assets
// with an optional scan_manifest JSON part and a tiny file part.
func newAssetUploadRequest(t *testing.T, manifest *service.UploadScanManifest, workspaceID, userID uuid.UUID) *http.Request {
	t.Helper()

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	// File part — content is irrelevant because rejection happens before the
	// upload service is called.
	fw, err := mw.CreateFormFile("file", "test.jpg")
	require.NoError(t, err)
	_, _ = fw.Write([]byte("fake-jpeg-bytes"))

	// Optional scan_manifest part.
	if manifest != nil {
		manifestJSON, err := json.Marshal(manifest)
		require.NoError(t, err)
		part, err := mw.CreateFormField("scan_manifest")
		require.NoError(t, err)
		_, _ = part.Write(manifestJSON)
	}

	require.NoError(t, mw.Close())

	req := httptest.NewRequest(http.MethodPost, "/api/v1/assets", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())

	claims := map[string]interface{}{
		"sub":           userID.String(),
		"workspace_id":  workspaceID.String(),
		"platform_role": "photographer",
	}
	ctx := middleware.WithJWTClaims(req.Context(), claims)
	ctx = middleware.WithWorkspaceID(ctx, workspaceID.String())
	return req.WithContext(ctx)
}

// setupAssetUploadHandler constructs an AssetHandler with a validation service
// backed by a stub workspace policy reader. The upload service is nil because
// the tests assert on pre-upload rejection paths only.
func setupAssetUploadHandler(t *testing.T, mode service.PolicyMode) *handler.AssetHandler {
	t.Helper()
	// Re-declare the stub inline (can't cross-reference chunked_upload_test.go
	// definitions because test files are compiled per-file within a package —
	// Go test files can share the package, so this WILL reference the
	// chunked_upload_test.go stub, but we also keep it defensive here.)
	stubReader := &assetUploadStubReader{mode: mode}
	validationSvc := service.NewUploadManifestValidation(
		nil,        // catalog
		stubReader, // workspacePolicy
		nil,        // auditLog
		true,       // enforceMode
	)
	return handler.NewAssetHandler(nil, nil).WithValidation(validationSvc)
}

type assetUploadStubReader struct {
	mode service.PolicyMode
}

func (s *assetUploadStubReader) Get(_ context.Context, _ service.WorkspaceID) (service.PolicyMode, error) {
	return s.mode, nil
}

// TestAssetUpload_WithBlockManifest_Rejected mirrors the chunked upload
// block-manifest test for the direct multipart upload path. Without a gate
// on this handler, an attacker can bypass Tier D by skipping TUS entirely.
func TestAssetUpload_WithBlockManifest_Rejected(t *testing.T) {
	h := setupAssetUploadHandler(t, service.PolicyModeStandard)
	wsID := uuid.New()
	uID := uuid.New()

	manifest := &service.UploadScanManifest{
		PolicyVersion:  "upload-screening/2026-04-10",
		Engine:         service.ScanEngineBrowserWorker,
		EngineVersion:  "1.0.0",
		FileName:       "blocked.jpg",
		DeclaredType:   "image/jpeg",
		DetectedFormat: "jpeg",
		SHA256:         "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
		SizeBytes:      15,
		Decision:       "block",
		RiskScore:      0.95,
	}

	req := newAssetUploadRequest(t, manifest, wsID, uID)
	rr := httptest.NewRecorder()
	h.Upload(rr, req)

	assert.True(t, rr.Code >= 400 && rr.Code < 500,
		"expected 4xx for blocked manifest; got %d. Body: %s", rr.Code, rr.Body.String())
	assert.Contains(t, rr.Body.String(), "SCAN_DECISION_BLOCK",
		"expected SCAN_DECISION_BLOCK in body; got %s", rr.Body.String())
}

// TestAssetUpload_MissingManifest_StrictMode_Rejected mirrors the chunked
// upload missing-manifest strict-mode test.
func TestAssetUpload_MissingManifest_StrictMode_Rejected(t *testing.T) {
	h := setupAssetUploadHandler(t, service.PolicyModeStrictClientScan)
	wsID := uuid.New()
	uID := uuid.New()

	// nil manifest → ErrScanManifestRequired in strict mode.
	req := newAssetUploadRequest(t, nil, wsID, uID)
	rr := httptest.NewRecorder()
	h.Upload(rr, req)

	assert.True(t, rr.Code >= 400 && rr.Code < 500,
		"expected 4xx for missing manifest in strict mode; got %d. Body: %s",
		rr.Code, rr.Body.String())
	assert.Contains(t, rr.Body.String(), "SCAN_MANIFEST_REQUIRED",
		"expected SCAN_MANIFEST_REQUIRED in body; got %s", rr.Body.String())
}
