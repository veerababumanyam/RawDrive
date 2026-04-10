package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
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
// M16 E47-S5 — Round 3 RED tests for chunked upload Tier D validation gate.
//
// These tests verify that ChunkedUploadHandler.CreateSession enforces the
// upload-manifest validation rules from the per-workspace policy mode.
//
// Round 3 RED state:
//   TestChunkedUpload_WithBlockManifest_Rejected         → FAIL (handler returns 201)
//   TestChunkedUpload_MissingManifest_StrictMode_Rejected → FAIL (handler returns 201)
//
// Round 3 GREEN state (after CreateSession calls validationSvc.ValidateForSessionCreate):
//   Both tests pass — handler returns 4xx with the appropriate scan error code.
//
// IMPORTANT — DB integration deferred:
//   The test plan in M16-test-plan.json calls for these to be integration
//   tests hitting real Postgres via testsupport.PgvectorPool. Round 3 RED
//   ships them with a stub WorkspacePolicyReader instead because the existing
//   service.WorkspacePolicyDB interface uses database/sql signatures while the
//   project's test pool is pgxpool — building a pgx-to-sql adapter (or
//   refactoring WorkspacePolicyService to accept pgx directly) is itself a
//   substantial change that should land in Round 3 GREEN. The validation
//   logic under test is identical regardless of the policy-mode source, so
//   stubbing the reader is honest for RED proof.
//
// DEFERRED to a follow-up Round 3 RED batch:
//   TestChunkedUpload_WithValidManifest_Succeeds      (AC-UPS-001) — happy path
//   TestChunkedUpload_HashMismatchAtFinalize_Rejected (FR-UPS-022) — finalize hash check
//   Both deferred tests need a working upload pipeline (real ExifService,
//   real AssetRepo with real DB, working storage Put). These are tracked in
//   the Round 3 RED Sub-batch B checkpoint as P1 follow-ups.
// ─────────────────────────────────────────────────────────────────────────────

// stubWorkspacePolicyReader implements service.WorkspacePolicyReader so tests
// can drive the validation flow without needing a real database. Returns the
// configured mode for any workspace ID.
type stubWorkspacePolicyReader struct {
	mode service.PolicyMode
}

func (s *stubWorkspacePolicyReader) Get(_ context.Context, _ service.WorkspaceID) (service.PolicyMode, error) {
	return s.mode, nil
}

// chunkedUploadTestRig holds the wired-up dependencies for a single test case.
type chunkedUploadTestRig struct {
	handler     *handler.ChunkedUploadHandler
	workspaceID uuid.UUID
	userID      uuid.UUID
}

// setupChunkedUploadRig builds a fresh handler with the validation service
// wired to a stubbed workspace policy reader. The handler is constructed with
// nil uploadSvc/assetRepo/storage because tests in this batch reject the
// request at validation BEFORE any of those layers are touched.
//
// In Round 3 GREEN, the validation hook will actually run inside CreateSession
// and these tests will start enforcing. Until then, the validation service is
// present-but-unused — the RED state.
func setupChunkedUploadRig(t *testing.T, policyMode service.PolicyMode) *chunkedUploadTestRig {
	t.Helper()

	wsID := uuid.New()
	uID := uuid.New()

	// Validation service backed by a stub policy reader. The validation logic
	// itself (ValidateForSessionCreate) is real production code; only the
	// "where does the policy mode come from" lookup is stubbed.
	stubReader := &stubWorkspacePolicyReader{mode: policyMode}
	validationSvc := service.NewUploadManifestValidation(
		nil,        // catalog — nil means PolicyVersion checks are skipped (defensive default)
		stubReader, // workspacePolicy
		nil,        // auditLog
		true,       // enforceMode = true so strict-mode rejections actually return errors
	)

	// Real temp dir per test (auto-cleaned).
	tmpDir := t.TempDir()

	// nil uploadSvc / assetRepo / store — CreateSession path doesn't touch any
	// of these for tests that reject at validation. Round 3 GREEN will continue
	// to short-circuit before touching them, so this stays nil-safe in GREEN.
	h := handler.NewChunkedUploadHandler(nil, nil, nil, tmpDir).
		WithValidation(validationSvc)

	return &chunkedUploadTestRig{
		handler:     h,
		workspaceID: wsID,
		userID:      uID,
	}
}

// requestWithAuth builds an *http.Request with JWT claims and workspace ID
// injected into context. The handler reads these via getWorkspaceID/getUserID.
func (rig *chunkedUploadTestRig) requestWithAuth(method, path string, body []byte) *http.Request {
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	claims := map[string]interface{}{
		"sub":           rig.userID.String(),
		"workspace_id":  rig.workspaceID.String(),
		"platform_role": "photographer",
	}
	ctx := middleware.WithJWTClaims(req.Context(), claims)
	ctx = middleware.WithWorkspaceID(ctx, rig.workspaceID.String())
	return req.WithContext(ctx)
}

// chunkedUploadCreateBody mirrors the anonymous struct used inside
// ChunkedUploadHandler.CreateSession after the M16 Round 3 skeleton edit.
type chunkedUploadCreateBody struct {
	Filename     string                      `json:"filename"`
	ContentType  string                      `json:"content_type"`
	TotalSize    int64                       `json:"total_size"`
	ChunkSize    int64                       `json:"chunk_size,omitempty"`
	ScanManifest *service.UploadScanManifest `json:"scan_manifest,omitempty"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

// TestChunkedUpload_WithBlockManifest_Rejected covers AC-UPS-002:
// when the client posts a manifest with decision="block", the server must
// reject the upload session immediately with a 4xx error and the
// SCAN_DECISION_BLOCK error code, without creating any upload session state.
//
// Round 3 RED expectation: FAIL — handler returns 201 because validation is
// not yet wired into CreateSession. Round 3 GREEN will wire the validator
// and this test will pass.
func TestChunkedUpload_WithBlockManifest_Rejected(t *testing.T) {
	rig := setupChunkedUploadRig(t, service.PolicyModeStandard)

	manifest := &service.UploadScanManifest{
		PolicyVersion:  "v1",
		Engine:         service.ScanEngineBrowserWorker,
		EngineVersion:  "1.0.0",
		FileName:       "blocked.jpg",
		DeclaredType:   "image/jpeg",
		DetectedFormat: "jpeg",
		SHA256:         "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
		SizeBytes:      1024,
		Decision:       "block",
		RiskScore:      0.95,
	}

	body := chunkedUploadCreateBody{
		Filename:     "blocked.jpg",
		ContentType:  "image/jpeg",
		TotalSize:    1024,
		ScanManifest: manifest,
	}
	bodyBytes, err := json.Marshal(body)
	require.NoError(t, err)

	req := rig.requestWithAuth(http.MethodPost, "/api/v1/uploads", bodyBytes)
	rr := httptest.NewRecorder()
	rig.handler.CreateSession(rr, req)

	// Round 3 GREEN expectation: 4xx (likely 400 or 422) with SCAN_DECISION_BLOCK
	// error code. Round 3 RED expectation: 201 created (current behavior).
	assert.True(t, rr.Code >= 400 && rr.Code < 500,
		"expected 4xx for blocked manifest; got %d. Body: %s", rr.Code, rr.Body.String())
	assert.Contains(t, rr.Body.String(), "SCAN_DECISION_BLOCK",
		"expected response body to mention SCAN_DECISION_BLOCK; got: %s", rr.Body.String())
}

// TestChunkedUpload_MissingManifest_StrictMode_Rejected covers AC-UPS-006:
// when a workspace is configured for strict_client_scan mode and a client
// posts an upload session WITHOUT a scan_manifest at all, the server must
// reject with 4xx and SCAN_MANIFEST_REQUIRED error code.
//
// Round 3 RED expectation: FAIL — handler returns 201 because there is no
// validation gate yet. Round 3 GREEN will reject the request.
func TestChunkedUpload_MissingManifest_StrictMode_Rejected(t *testing.T) {
	rig := setupChunkedUploadRig(t, service.PolicyModeStrictClientScan)

	body := chunkedUploadCreateBody{
		Filename:    "no-manifest.jpg",
		ContentType: "image/jpeg",
		TotalSize:   2048,
		// ScanManifest intentionally omitted — strict mode must reject this.
	}
	bodyBytes, err := json.Marshal(body)
	require.NoError(t, err)

	req := rig.requestWithAuth(http.MethodPost, "/api/v1/uploads", bodyBytes)
	rr := httptest.NewRecorder()
	rig.handler.CreateSession(rr, req)

	assert.True(t, rr.Code >= 400 && rr.Code < 500,
		"expected 4xx for missing manifest in strict mode; got %d. Body: %s",
		rr.Code, rr.Body.String())
	assert.Contains(t, rr.Body.String(), "SCAN_MANIFEST_REQUIRED",
		"expected response body to mention SCAN_MANIFEST_REQUIRED; got: %s", rr.Body.String())
}
