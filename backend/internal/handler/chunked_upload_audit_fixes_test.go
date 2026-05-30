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
	payload := []byte("intact object")

	row := &repository.UploadSession{
		WorkspaceID: workspaceID,
		UserID:      uuid.New(),
		TUSUploadID: tusUploadID,
		Filename:    "ok.bin",
		ContentType: "application/octet-stream",
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
// declares the genuine SHA-256 of payload. DetectedFormat "tiff" passes
// session-create in standard mode (permissive) and hits the default branch in
// VerifyHeaderTrailerBytes (no header/trailer rejection), so the rolling-hash
// equality check is the SOLE discriminator at finalize — exactly what F-023
// needs to detect a double-absorbed chunk.
func (rig *streamingRig) createSessionWithTrueHash(t *testing.T, filename string, payload []byte) string {
	t.Helper()
	sum := sha256.Sum256(payload)
	manifest := &service.UploadScanManifest{
		PolicyVersion:  "v1",
		Engine:         service.ScanEngineBrowserWorker,
		EngineVersion:  "1.0.0",
		FileName:       filename,
		DeclaredType:   "image/tiff",
		DetectedFormat: "tiff",
		SHA256:         hex.EncodeToString(sum[:]),
		SizeBytes:      int64(len(payload)),
		Decision:       "pass",
		RiskScore:      0.0,
	}
	body, _ := json.Marshal(map[string]interface{}{
		"filename":      filename,
		"content_type":  "application/octet-stream",
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
	payload := []byte("chunk-bytes-that-must-be-hashed-exactly-once")
	uploadID := rig.createSessionWithTrueHash(t, "retry.bin", payload)

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
