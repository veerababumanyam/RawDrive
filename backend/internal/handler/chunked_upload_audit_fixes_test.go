package handler_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/storage"
)

// ─────────────────────────────────────────────────────────────────────────────
// F-021 — orphaned storage object on scan_manifest decode failure at finalize.
//
// finalizeUpload composes the multipart object via CompleteMultipartUpload and
// only THEN decodes the persisted scan_manifest column. If that JSON decode
// fails (truncated write, schema drift after a migration) the assembled object
// must be deleted, otherwise it is orphaned forever — the multipart-abort
// sweeper is a no-op once Complete has succeeded. The digest-compute and
// manifest-verification failure paths already delete the object; this guards
// the manifest-decode path that previously returned without deleting.
// ─────────────────────────────────────────────────────────────────────────────

// seedCompletableUpload primes a fakeMultipartStore so a subsequent
// CompleteMultipartUpload for storageKey succeeds and assembles partBytes.
// Returns the multipart upload id to put on the session row.
func seedCompletableUpload(t *testing.T, store *fakeMultipartStore, storageKey string, partBytes []byte) string {
	t.Helper()
	mpID, err := store.CreateMultipartUpload(context.Background(), storageKey, "application/octet-stream")
	require.NoError(t, err)
	_, err = store.UploadPart(context.Background(), storageKey, mpID, 1, bytes.NewReader(partBytes), int64(len(partBytes)))
	require.NoError(t, err)
	return mpID
}

func TestF021_FinalizeManifestDecodeFailureDeletesOrphanedObject(t *testing.T) {
	store := newFakeMultipartStore()
	sessions := newFakeSessionStore()

	workspaceID := uuid.New()
	tusUploadID := uuid.New().String()
	payload := []byte("the fully-assembled object bytes")

	// Build the row exactly as deriveKeyAndUploadID would key it.
	row := &repository.UploadSession{
		WorkspaceID: workspaceID,
		UserID:      uuid.New(),
		TUSUploadID: tusUploadID,
		Filename:    "photo.bin",
		ContentType: "application/octet-stream",
		TotalSize:   int64(len(payload)),
	}
	storageKey, _ := handler.DeriveKeyAndUploadIDForTest(row)

	// Seed a completable multipart upload and stamp its id onto the row.
	mpID := seedCompletableUpload(t, store, storageKey, payload)
	row.R2MultipartUploadID = &mpID

	// One valid part etag so finalize's CompleteMultipartUpload runs.
	partsJSON, _ := json.Marshal([]repository.UploadPartETag{
		{PartNumber: 1, ETag: "etag-" + mpID + "-1", Size: int64(len(payload)), SHA256: hex.EncodeToString(make([]byte, 32))},
	})
	row.R2PartETags = partsJSON

	// CORRUPT scan_manifest: not valid JSON for a *service.UploadScanManifest.
	row.ScanManifest = []byte(`{"sha256": this-is-not-valid-json`)

	_, err := handler.FinalizeUploadForTest(store, sessions, row)
	require.Error(t, err, "finalize must surface the manifest-decode failure")
	assert.Contains(t, err.Error(), "decode scan manifest",
		"error must identify the manifest decode as the cause")

	// The assembled object MUST have been deleted (orphan reclaimed). Before
	// the F-021 fix this branch returned without deleting, leaking the object.
	store.mu.Lock()
	deleted := store.deleted[storageKey]
	_, stillPresent := store.completed[storageKey]
	store.mu.Unlock()
	assert.True(t, deleted, "the assembled object must be deleted on manifest decode failure")
	assert.False(t, stillPresent, "the assembled object must not remain in storage")
}

// Negative control: a VALID (or absent) manifest must NOT trigger a delete of
// the assembled object on the decode path. We use an empty manifest column
// (len==0) which skips the decode branch entirely, plus a stub validator-less
// handler so verifyManifestAtFinalize is a no-op. This guards against an
// over-eager fix that deletes on the happy path.
func TestF021_FinalizeValidManifestKeepsObject(t *testing.T) {
	store := newFakeMultipartStore()
	sessions := newFakeSessionStore()

	workspaceID := uuid.New()
	tusUploadID := uuid.New().String()
	payload := append([]byte{0xFF, 0xD8}, []byte("intact object")...)
	payload = append(payload, 0xFF, 0xD9)

	row := &repository.UploadSession{
		WorkspaceID: workspaceID,
		UserID:      uuid.New(),
		TUSUploadID: tusUploadID,
		Filename:    "ok.jpg",
		ContentType: "image/jpeg",
		TotalSize:   int64(len(payload)),
	}
	storageKey, _ := handler.DeriveKeyAndUploadIDForTest(row)
	mpID := seedCompletableUpload(t, store, storageKey, payload)
	row.R2MultipartUploadID = &mpID
	partsJSON, _ := json.Marshal([]repository.UploadPartETag{
		{PartNumber: 1, ETag: "etag-" + mpID + "-1", Size: int64(len(payload))},
	})
	row.R2PartETags = partsJSON
	// No scan_manifest → decode branch skipped entirely.

	_, err := handler.FinalizeUploadForTest(store, sessions, row)
	require.NoError(t, err, "finalize must succeed with no manifest and a nil assetRepo")

	store.mu.Lock()
	deleted := store.deleted[storageKey]
	store.mu.Unlock()
	assert.False(t, deleted, "object must NOT be deleted on the happy path")
}

// ─────────────────────────────────────────────────────────────────────────────
// F-023 — rolling hash must NOT double-absorb a chunk when UploadPart fails
// transiently and the TUS client retries the same offset.
//
// Before the fix, nextPart++ + absorbChunk ran BEFORE UploadPart. A transient
// UploadPart failure (500, no rollback) followed by a same-offset retry
// re-absorbed the same bytes, so the rolling SHA-256 contained them twice and
// finalize failed with SCAN_HASH_MISMATCH. After the fix the chunk is folded
// into the hash only after UploadPart + AppendPartETag + UpdateOffset succeed,
// so a retry processes the chunk exactly once and finalize produces the
// correct hash.
// ─────────────────────────────────────────────────────────────────────────────

// failOnceMultipartStore wraps fakeMultipartStore semantics but fails the
// FIRST UploadPart call, then behaves normally. This reproduces a transient
// B2/network blip on a single chunk.
type failOnceMultipartStore struct {
	*fakeMultipartStore
	mu            sync.Mutex
	uploadCalls   int
	failUntilCall int // fail UploadPart while uploadCalls <= failUntilCall
}

func (f *failOnceMultipartStore) UploadPart(ctx context.Context, key, uploadID string, partNumber int32, body io.Reader, size int64) (string, error) {
	f.mu.Lock()
	f.uploadCalls++
	shouldFail := f.uploadCalls <= f.failUntilCall
	f.mu.Unlock()
	if shouldFail {
		// Drain the body so the caller's bytes.Reader is consistent with a
		// real failed network write, then return a transient error.
		_, _ = io.Copy(io.Discard, body)
		return "", errors.New("transient B2 UploadPart failure")
	}
	return f.fakeMultipartStore.UploadPart(ctx, key, uploadID, partNumber, body, size)
}

var _ storage.Provider = (*failOnceMultipartStore)(nil)
var _ storage.MultipartCapable = (*failOnceMultipartStore)(nil)

// newAuditRig builds a streamingRig over a caller-supplied store + sessions,
// wired with the same accept-everything Tier D validator setupStreamingRig
// uses so the finalize hash check actually runs (it no-ops when validationSvc
// is nil).
func newAuditRig(t *testing.T, store storage.Provider, sessions *fakeUploadSessionStore) *streamingRig {
	t.Helper()
	stubReader := &stubWorkspacePolicyReader{mode: service.PolicyModeStandard}
	validationSvc := service.NewUploadManifestValidation(nil, stubReader, nil, true)
	h := handler.NewChunkedUploadHandler(nil, nil, store, sessions).
		WithValidation(validationSvc)
	return &streamingRig{
		handler:     h,
		sessions:    sessions,
		workspaceID: uuid.New(),
		userID:      uuid.New(),
	}
}

// createSessionWithTrueHash opens a single-chunk session whose scan_manifest
// declares the genuine SHA-256 of payload. The payload is a minimal WebP-like
// byte stream so the server-side spot-check also passes after the hash check.
func (rig *streamingRig) createSessionWithTrueHash(t *testing.T, filename string, payload []byte) string {
	t.Helper()
	sum := sha256.Sum256(payload)
	manifest := &service.UploadScanManifest{
		PolicyVersion:  "v1",
		Engine:         service.ScanEngineBrowserWorker,
		EngineVersion:  "1.0.0",
		FileName:       filename,
		DeclaredType:   "image/webp",
		DetectedFormat: "webp",
		SHA256:         hex.EncodeToString(sum[:]),
		SizeBytes:      int64(len(payload)),
		Decision:       "pass",
		RiskScore:      0.0,
	}
	body, _ := json.Marshal(map[string]interface{}{
		"filename":      filename,
		"content_type":  "image/webp",
		"total_size":    int64(len(payload)),
		"chunk_size":    int64(len(payload)),
		"scan_manifest": manifest,
	})
	req := rig.authedRequest(http.MethodPost, "/api/v1/uploads", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	rig.handler.CreateSession(rr, req)
	require.Equal(t, http.StatusCreated, rr.Code, "CreateSession failed: %s", rr.Body.String())
	var resp struct {
		UploadID string `json:"upload_id"`
	}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	require.NotEmpty(t, resp.UploadID)
	return resp.UploadID
}

func TestF023_TransientUploadPartFailureThenRetryDoesNotCorruptRollingHash(t *testing.T) {
	sessions := newFakeSessionStore()
	failStore := &failOnceMultipartStore{
		fakeMultipartStore: newFakeMultipartStore(),
		failUntilCall:      1, // first UploadPart fails, retry succeeds
	}

	// Single-chunk upload whose manifest declares the TRUE sha256 of the
	// payload. If the rolling hash double-absorbs the chunk on retry, the
	// computed hash will not match and finalize returns 422.
	rig := newAuditRig(t, failStore, sessions)
	payload := append([]byte{'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P'}, []byte("chunk-bytes-that-must-be-hashed-exactly-once")...)
	uploadID := rig.createSessionWithTrueHash(t, "retry.webp", payload)

	// First PATCH: UploadPart fails → 500, NO state mutation, offset unchanged.
	rr := rig.patchChunk(t, uploadID, 0, payload, "")
	require.Equal(t, http.StatusInternalServerError, rr.Code,
		"first PATCH must 500 on transient UploadPart failure; got %d: %s", rr.Code, rr.Body.String())

	row, err := sessions.GetByTUSUploadID(context.Background(), uploadID)
	require.NoError(t, err)
	require.Equal(t, int64(0), row.UploadOffset, "offset must NOT advance after a failed chunk")

	// Retry the SAME offset. UploadPart now succeeds; the chunk must be
	// absorbed exactly once → finalize hash matches → 200 (not 422).
	rr = rig.patchChunk(t, uploadID, 0, payload, "")
	require.Equal(t, http.StatusOK, rr.Code,
		"retry at the same offset must finalize successfully (no double-absorb); got %d: %s", rr.Code, rr.Body.String())
	assert.NotContains(t, rr.Body.String(), "SCAN_HASH_MISMATCH",
		"a double-absorbed rolling hash would surface as SCAN_HASH_MISMATCH")

	row, err = sessions.GetByTUSUploadID(context.Background(), uploadID)
	require.NoError(t, err)
	require.NotNil(t, row.CompletedAt, "session must finalize after the successful retry")
}

// ─────────────────────────────────────────────────────────────────────────────
// F-064 — TUS Upload-Offset header must be enforced on PATCH.
//
// TUS 1.0.0 §5.3 makes Upload-Offset MANDATORY on PATCH and requires a 409 when
// it does not match the server's current offset. Before the fix the offset
// check was gated behind `if offsetStr != ""`, so an ABSENT header skipped
// validation entirely and a PRESENT-but-unparseable header was silently
// ignored (parseErr swallowed). Both cases removed the offset-ordering guard.
// After the fix: 400 when the header is absent, 400 when it is malformed, 409
// on mismatch, and the existing happy path (matching offset) still succeeds.
// ─────────────────────────────────────────────────────────────────────────────

// patchChunkRawOffset PATCHes a chunk through the chi router with full control
// over the Upload-Offset header. When offsetHeader is the sentinel "<omit>" the
// header is not set at all (reproducing a non-compliant client). Any other
// value (including malformed strings) is sent verbatim.
const omitOffsetHeader = "<omit>"

func (rig *streamingRig) patchChunkRawOffset(t *testing.T, uploadID, offsetHeader string, chunk []byte) *httptest.ResponseRecorder {
	t.Helper()
	req := rig.authedRequest(http.MethodPatch, "/api/v1/uploads/"+uploadID, bytes.NewReader(chunk))
	req.Header.Set("Content-Type", "application/offset+octet-stream")
	if offsetHeader != omitOffsetHeader {
		req.Header.Set("Upload-Offset", offsetHeader)
	}
	r := chi.NewRouter()
	rig.handler.RegisterRoutes(r)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	return rr
}

func TestF064_PatchRejectsAbsentUploadOffsetHeader(t *testing.T) {
	rig := setupStreamingRig(t)
	payload := bytes.Repeat([]byte("Z"), 64)
	uploadID := rig.createSession(t, "noheader.bin", int64(len(payload)))

	rr := rig.patchChunkRawOffset(t, uploadID, omitOffsetHeader, payload)
	require.Equal(t, http.StatusBadRequest, rr.Code,
		"absent Upload-Offset must 400 (TUS §5.3 makes it mandatory); got %d: %s", rr.Code, rr.Body.String())
	assert.Contains(t, rr.Body.String(), "Upload-Offset header required")

	// The offset must NOT have advanced — the chunk was rejected before any
	// storage/state mutation.
	row, err := rig.sessions.GetByTUSUploadID(context.Background(), uploadID)
	require.NoError(t, err)
	assert.Equal(t, int64(0), row.UploadOffset, "rejected PATCH must not advance the offset")
}

func TestF064_PatchRejectsMalformedUploadOffsetHeader(t *testing.T) {
	rig := setupStreamingRig(t)
	payload := bytes.Repeat([]byte("Z"), 64)
	uploadID := rig.createSession(t, "badheader.bin", int64(len(payload)))

	rr := rig.patchChunkRawOffset(t, uploadID, "not-a-number", payload)
	require.Equal(t, http.StatusBadRequest, rr.Code,
		"unparseable Upload-Offset must 400, not be silently ignored; got %d: %s", rr.Code, rr.Body.String())
	assert.Contains(t, rr.Body.String(), "Upload-Offset header invalid")

	row, err := rig.sessions.GetByTUSUploadID(context.Background(), uploadID)
	require.NoError(t, err)
	assert.Equal(t, int64(0), row.UploadOffset, "rejected PATCH must not advance the offset")
}

func TestF064_PatchRejectsMismatchedUploadOffsetHeader(t *testing.T) {
	rig := setupStreamingRig(t)
	payload := bytes.Repeat([]byte("Z"), 64)
	uploadID := rig.createSession(t, "mismatch.bin", int64(len(payload)))

	// Server offset is 0; declare 999 → 409 per TUS §5.3.
	rr := rig.patchChunkRawOffset(t, uploadID, "999", payload)
	require.Equal(t, http.StatusConflict, rr.Code,
		"mismatched Upload-Offset must 409; got %d: %s", rr.Code, rr.Body.String())

	row, err := rig.sessions.GetByTUSUploadID(context.Background(), uploadID)
	require.NoError(t, err)
	assert.Equal(t, int64(0), row.UploadOffset, "rejected PATCH must not advance the offset")
}

// Negative control: a correct, matching Upload-Offset header still succeeds —
// the fix must not break the happy path.
func TestF064_PatchAcceptsMatchingUploadOffsetHeader(t *testing.T) {
	rig := setupStreamingRig(t)
	payload := bytes.Repeat([]byte("Z"), 64)
	payload[0], payload[1] = 0xFF, 0xD8
	payload[len(payload)-2], payload[len(payload)-1] = 0xFF, 0xD9
	uploadID := rig.createSession(t, "ok.bin", int64(len(payload)))

	rr := rig.patchChunkRawOffset(t, uploadID, "0", payload)
	require.Equal(t, http.StatusOK, rr.Code,
		"a matching Upload-Offset must still succeed; got %d: %s", rr.Code, rr.Body.String())
}

// ─────────────────────────────────────────────────────────────────────────────
// F-053 — 5xx responses must not leak raw internal error text.
//
// Numerous handlers embedded err.Error() directly into 500 bodies, exposing
// storage-layer detail (B2 bucket names, object paths, multipart upload IDs)
// and Postgres error text (table/column/constraint names) to clients. After
// the fix the 500 body is generic ("internal server error" + an opaque code)
// and the raw error is logged server-side only.
// ─────────────────────────────────────────────────────────────────────────────

// sensitiveErr models the kind of error a storage/DB layer returns — it carries
// a B2 bucket name, an object path, and Postgres constraint text that must
// never reach the client.
var sensitiveErr = errors.New("pq: duplicate key value violates unique constraint \"upload_sessions_pkey\" in bucket rawdrive-prod-photos at key ws/obj/original.jpg multipartId=2~aBcXyZ")

func assertNoLeak(t *testing.T, rr *httptest.ResponseRecorder) {
	t.Helper()
	require.Equal(t, http.StatusInternalServerError, rr.Code,
		"expected a 500 for this failure path; got %d: %s", rr.Code, rr.Body.String())
	body := rr.Body.String()
	assert.NotContains(t, body, "rawdrive-prod-photos", "B2 bucket name must not leak")
	assert.NotContains(t, body, "upload_sessions_pkey", "Postgres constraint name must not leak")
	assert.NotContains(t, body, "multipartId", "multipart upload id must not leak")
	assert.NotContains(t, body, "ws/obj/original.jpg", "object path must not leak")
	assert.Contains(t, body, "internal server error", "client must receive a generic 500 body")
}

// TestF053_UploadChunkSessionLookupErrorDoesNotLeak drives the
// GetByTUSUploadID failure branch in UploadChunk by configuring the fake store
// to return a sensitive error for a session that otherwise exists.
func TestF053_UploadChunkSessionLookupErrorDoesNotLeak(t *testing.T) {
	rig := setupStreamingRig(t)
	uploadID := rig.createSession(t, "leak.bin", 64)

	// Now make every Get fail with a sensitive error → the non-not-found 500
	// branch in UploadChunk fires.
	rig.sessions.getErr = sensitiveErr

	rr := rig.patchChunkRawOffset(t, uploadID, "0", bytes.Repeat([]byte("A"), 64))
	assertNoLeak(t, rr)
}

// TestF053_GetOffsetSessionLookupErrorDoesNotLeak drives the GetOffset 500
// branch.
func TestF053_GetOffsetSessionLookupErrorDoesNotLeak(t *testing.T) {
	rig := setupStreamingRig(t)
	uploadID := rig.createSession(t, "leak.bin", 64)
	rig.sessions.getErr = sensitiveErr

	req := rig.authedRequest(http.MethodHead, "/api/v1/uploads/"+uploadID, nil)
	r := chi.NewRouter()
	rig.handler.RegisterRoutes(r)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assertNoLeak(t, rr)
}

// TestF053_CancelDeleteErrorDoesNotLeak drives the Delete 500 branch in Cancel.
func TestF053_CancelDeleteErrorDoesNotLeak(t *testing.T) {
	rig := setupStreamingRig(t)
	uploadID := rig.createSession(t, "leak.bin", 64)
	rig.sessions.deleteErr = sensitiveErr

	req := rig.authedRequest(http.MethodDelete, "/api/v1/uploads/"+uploadID, nil)
	r := chi.NewRouter()
	rig.handler.RegisterRoutes(r)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assertNoLeak(t, rr)
}

// TestF053_CreateSessionPersistFailureDoesNotLeak drives the Create 500 branch
// in CreateSession (the failed-to-persist-session path).
func TestF053_CreateSessionPersistFailureDoesNotLeak(t *testing.T) {
	rig := setupStreamingRig(t)
	rig.sessions.createErr = sensitiveErr

	body, _ := json.Marshal(map[string]interface{}{
		"filename":     "leak.bin",
		"content_type": "image/jpeg",
		"total_size":   int64(64),
		"chunk_size":   int64(64),
	})
	req := rig.authedRequest(http.MethodPost, "/api/v1/uploads", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	rig.handler.CreateSession(rr, req)
	assertNoLeak(t, rr)
}
