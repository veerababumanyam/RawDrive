package handler_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/storage"
)

// ─────────────────────────────────────────────────────────────────────────────
// F-013 (M17 wave 6) — RED tests for the direct-R2 streaming TUS handler.
//
// Wave 5 shipped storage/multipart.go (MultipartCapable + S3 impl). Wave 6
// wires that capability into ChunkedUploadHandler so uploaded bytes flow
// straight to R2 without ever touching the local disk (F-008 hard-law).
// Session state moves from an in-memory sync.Map to the upload_sessions
// table (F-013 durability requirement) via *repository.UploadSessionsRepo.
//
// These tests use fake implementations of both the session store and the
// multipart provider so the happy path can be exercised end-to-end without
// a real Postgres or a real R2 bucket.
// ─────────────────────────────────────────────────────────────────────────────

// ─── fakeUploadSessionStore ───────────────────────────────────────────────
//
// An in-memory implementation of handler.UploadSessionStore. Mirrors the
// narrow set of methods the handler actually calls (matching the real
// *repository.UploadSessionsRepo by structural typing).
type fakeUploadSessionStore struct {
	mu   sync.Mutex
	rows map[string]*repository.UploadSession // keyed by tus_upload_id

	createErr error
	getErr    error
	updateErr error
	appendErr error
	markErr   error
	deleteErr error
}

func newFakeSessionStore() *fakeUploadSessionStore {
	return &fakeUploadSessionStore{rows: make(map[string]*repository.UploadSession)}
}

func (f *fakeUploadSessionStore) Create(_ context.Context, s *repository.UploadSession) error {
	if f.createErr != nil {
		return f.createErr
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	if s.CreatedAt.IsZero() {
		s.CreatedAt = time.Now().UTC()
		s.UpdatedAt = s.CreatedAt
	}
	if len(s.R2PartETags) == 0 {
		s.R2PartETags = []byte("[]")
	}
	copy := *s
	f.rows[s.TUSUploadID] = &copy
	return nil
}

func (f *fakeUploadSessionStore) GetByTUSUploadID(_ context.Context, tusUploadID string) (*repository.UploadSession, error) {
	if f.getErr != nil {
		return nil, f.getErr
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	row, ok := f.rows[tusUploadID]
	if !ok {
		return nil, repository.ErrUploadSessionNotFound
	}
	copy := *row
	return &copy, nil
}

func (f *fakeUploadSessionStore) UpdateOffset(_ context.Context, tusUploadID string, newOffset int64) error {
	if f.updateErr != nil {
		return f.updateErr
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	row, ok := f.rows[tusUploadID]
	if !ok {
		return repository.ErrUploadSessionNotFound
	}
	row.UploadOffset = newOffset
	row.UpdatedAt = time.Now().UTC()
	return nil
}

func (f *fakeUploadSessionStore) AppendPartETag(_ context.Context, tusUploadID string, part repository.UploadPartETag) error {
	if f.appendErr != nil {
		return f.appendErr
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	row, ok := f.rows[tusUploadID]
	if !ok {
		return repository.ErrUploadSessionNotFound
	}
	// Parse existing, append, re-marshal.
	var existing []repository.UploadPartETag
	if len(row.R2PartETags) > 0 {
		_ = json.Unmarshal(row.R2PartETags, &existing)
	}
	existing = append(existing, part)
	b, _ := json.Marshal(existing)
	row.R2PartETags = b
	row.UpdatedAt = time.Now().UTC()
	return nil
}

func (f *fakeUploadSessionStore) MarkCompleted(_ context.Context, tusUploadID string) error {
	if f.markErr != nil {
		return f.markErr
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	row, ok := f.rows[tusUploadID]
	if !ok {
		return repository.ErrUploadSessionNotFound
	}
	now := time.Now().UTC()
	row.CompletedAt = &now
	row.UpdatedAt = now
	return nil
}

func (f *fakeUploadSessionStore) Delete(_ context.Context, tusUploadID string) error {
	if f.deleteErr != nil {
		return f.deleteErr
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.rows, tusUploadID)
	return nil
}

// ─── fakeMultipartStore ───────────────────────────────────────────────────
//
// An in-memory MultipartCapable + Provider-compatible store. Captures the
// bytes actually uploaded so the test can assert the full-file hash
// matches the declared manifest hash.
type fakeMultipartStore struct {
	mu        sync.Mutex
	uploads   map[string]*fakeMultipartUpload // uploadID -> parts
	completed map[string][]byte               // storageKey -> final bytes
	deleted   map[string]bool                 // storageKey tombstones

	createErr   error
	uploadErr   error
	completeErr error
	abortErr    error
	getErr      error
	putErr      error
	deleteErr   error
	idCounter   int
}

type fakeMultipartUpload struct {
	storageKey  string
	contentType string
	parts       map[int32][]byte
	aborted     bool
}

func newFakeMultipartStore() *fakeMultipartStore {
	return &fakeMultipartStore{
		uploads:   make(map[string]*fakeMultipartUpload),
		completed: make(map[string][]byte),
		deleted:   make(map[string]bool),
	}
}

// Provider methods — only Get, Put, Delete are called by the handler.
func (f *fakeMultipartStore) Put(_ context.Context, key string, body io.Reader, _ int64, _ string) error {
	if f.putErr != nil {
		return f.putErr
	}
	b, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.completed[key] = b
	return nil
}

func (f *fakeMultipartStore) Get(_ context.Context, key string) (io.ReadCloser, error) {
	if f.getErr != nil {
		return nil, f.getErr
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	data, ok := f.completed[key]
	if !ok {
		return nil, errors.New("not found: " + key)
	}
	return io.NopCloser(bytes.NewReader(data)), nil
}

func (f *fakeMultipartStore) Delete(_ context.Context, key string) error {
	if f.deleteErr != nil {
		return f.deleteErr
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.completed, key)
	f.deleted[key] = true
	return nil
}

func (f *fakeMultipartStore) PresignURL(_ context.Context, _ string, _ storage.PresignOptions) (string, error) {
	return "", errors.New("not implemented in fake")
}

func (f *fakeMultipartStore) HealthCheck() storage.HealthStatus {
	return storage.HealthStatus{Status: "ok", Driver: "fake"}
}

// MultipartCapable methods.
func (f *fakeMultipartStore) CreateMultipartUpload(_ context.Context, key string, contentType string) (string, error) {
	if f.createErr != nil {
		return "", f.createErr
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.idCounter++
	uploadID := fmt.Sprintf("mp-%04d", f.idCounter)
	f.uploads[uploadID] = &fakeMultipartUpload{
		storageKey:  key,
		contentType: contentType,
		parts:       make(map[int32][]byte),
	}
	return uploadID, nil
}

func (f *fakeMultipartStore) UploadPart(_ context.Context, _ string, uploadID string, partNumber int32, body io.Reader, _ int64) (string, error) {
	if f.uploadErr != nil {
		return "", f.uploadErr
	}
	b, err := io.ReadAll(body)
	if err != nil {
		return "", err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	u, ok := f.uploads[uploadID]
	if !ok {
		return "", errors.New("unknown upload id: " + uploadID)
	}
	u.parts[partNumber] = b
	return fmt.Sprintf("etag-%s-%d", uploadID, partNumber), nil
}

func (f *fakeMultipartStore) CompleteMultipartUpload(_ context.Context, key string, uploadID string, parts []storage.CompletedPart) error {
	if f.completeErr != nil {
		return f.completeErr
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	u, ok := f.uploads[uploadID]
	if !ok {
		return errors.New("unknown upload id: " + uploadID)
	}
	if u.aborted {
		return errors.New("upload aborted")
	}
	var buf bytes.Buffer
	for _, p := range parts {
		chunk, ok := u.parts[p.PartNumber]
		if !ok {
			return fmt.Errorf("missing part %d", p.PartNumber)
		}
		buf.Write(chunk)
	}
	f.completed[key] = buf.Bytes()
	delete(f.uploads, uploadID)
	return nil
}

func (f *fakeMultipartStore) AbortMultipartUpload(_ context.Context, _ string, uploadID string) error {
	if f.abortErr != nil {
		return f.abortErr
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	u, ok := f.uploads[uploadID]
	if !ok {
		return nil // S3 abort is idempotent; mirror that.
	}
	u.aborted = true
	return nil
}

// Compile-time checks.
var _ storage.Provider = (*fakeMultipartStore)(nil)
var _ storage.MultipartCapable = (*fakeMultipartStore)(nil)

// ─── test rig ──────────────────────────────────────────────────────────────

type streamingRig struct {
	handler     *handler.ChunkedUploadHandler
	sessions    *fakeUploadSessionStore
	store       *fakeMultipartStore
	workspaceID uuid.UUID
	userID      uuid.UUID
}

func setupStreamingRig(t *testing.T) *streamingRig {
	t.Helper()
	sessions := newFakeSessionStore()
	store := newFakeMultipartStore()

	// Stub validation service (accepts everything). Wave 6 regression tests
	// rely on this so happy-path streaming tests do not trip M16 Tier D.
	stubReader := &stubWorkspacePolicyReader{mode: service.PolicyModeStandard}
	validationSvc := service.NewUploadManifestValidation(nil, stubReader, nil, true)

	// F-013 wave 6: the handler takes nil uploadSvc + nil assetRepo for these
	// unit tests because they drive the streaming path without creating real
	// asset rows. Finalize integration with the real AssetRepo is covered by
	// a follow-up integration test with a live DB.
	h := handler.NewChunkedUploadHandler(nil, nil, store, sessions).
		WithValidation(validationSvc)

	return &streamingRig{
		handler:     h,
		sessions:    sessions,
		store:       store,
		workspaceID: uuid.New(),
		userID:      uuid.New(),
	}
}

func (rig *streamingRig) authedRequest(method, path string, body io.Reader) *http.Request {
	req := httptest.NewRequest(method, path, body)
	claims := map[string]interface{}{
		"sub":           rig.userID.String(),
		"workspace_id":  rig.workspaceID.String(),
		"platform_role": "photographer",
	}
	ctx := middleware.WithJWTClaims(req.Context(), claims)
	ctx = middleware.WithWorkspaceID(ctx, rig.workspaceID.String())
	return req.WithContext(ctx)
}

func (rig *streamingRig) createSession(t *testing.T, filename string, totalSize int64) string {
	t.Helper()
	body := map[string]interface{}{
		"filename":     filename,
		"content_type": "image/jpeg",
		"total_size":   totalSize,
		"chunk_size":   int64(64), // small chunks for test
	}
	bodyBytes, err := json.Marshal(body)
	require.NoError(t, err)

	req := rig.authedRequest(http.MethodPost, "/api/v1/uploads", bytes.NewReader(bodyBytes))
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

// patchChunk PATCHes a chunk through the chi router so URL params resolve.
func (rig *streamingRig) patchChunk(t *testing.T, uploadID string, offset int64, chunk []byte, checksum string) *httptest.ResponseRecorder {
	t.Helper()
	req := rig.authedRequest(http.MethodPatch, "/api/v1/uploads/"+uploadID, bytes.NewReader(chunk))
	req.Header.Set("Content-Type", "application/offset+octet-stream")
	req.Header.Set("Upload-Offset", strconv.FormatInt(offset, 10))
	if checksum != "" {
		req.Header.Set("Upload-Checksum", "sha256 "+checksum)
	}

	// Route via chi so the URL param is extracted.
	r := chi.NewRouter()
	rig.handler.RegisterRoutes(r)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	return rr
}

// ─── tests ─────────────────────────────────────────────────────────────────

// TestCreateSession_PersistsToDBAndCreatesR2Upload verifies that the
// rewritten handler (a) persists a row to the upload_sessions store,
// (b) calls R2 CreateMultipartUpload, and (c) records the returned
// r2_multipart_upload_id on the session row.
func TestCreateSession_PersistsToDBAndCreatesR2Upload(t *testing.T) {
	rig := setupStreamingRig(t)

	uploadID := rig.createSession(t, "photo.jpg", 128)

	row, err := rig.sessions.GetByTUSUploadID(context.Background(), uploadID)
	require.NoError(t, err, "session row must exist after CreateSession")
	assert.Equal(t, rig.workspaceID, row.WorkspaceID, "workspace_id must match JWT claims")
	assert.Equal(t, rig.userID, row.UserID, "user_id must match JWT claims")
	assert.Equal(t, int64(128), row.TotalSize)
	assert.Equal(t, int64(0), row.UploadOffset, "initial offset must be 0")
	require.NotNil(t, row.R2MultipartUploadID, "R2 multipart upload ID must be persisted")
	assert.NotEmpty(t, *row.R2MultipartUploadID)
}

// TestUploadChunk_StreamsToR2AndUpdatesOffset covers the single-chunk
// happy path: a PATCH with a full payload should stream to R2 UploadPart,
// update upload_offset in the DB, and finalize by calling
// CompleteMultipartUpload. The resulting stored object must match the
// input bytes exactly.
func TestUploadChunk_SingleChunkFinalizes(t *testing.T) {
	rig := setupStreamingRig(t)

	payload := bytes.Repeat([]byte("A"), 128)
	payload[0], payload[1] = 0xFF, 0xD8
	payload[len(payload)-2], payload[len(payload)-1] = 0xFF, 0xD9
	uploadID := rig.createSession(t, "photo.bin", int64(len(payload)))

	// Register asset repo stub by setting h internally — the finalize path
	// now creates an asset row via h.assetRepo. Since we passed nil for
	// assetRepo, the handler must tolerate nil (no-op create) for the unit
	// test. Wave 6 GREEN adds that nil-guard.
	rr := rig.patchChunk(t, uploadID, 0, payload, "")
	require.Equal(t, http.StatusOK, rr.Code, "PATCH failed: %s", rr.Body.String())

	row, err := rig.sessions.GetByTUSUploadID(context.Background(), uploadID)
	require.NoError(t, err)
	assert.Equal(t, int64(128), row.UploadOffset, "offset must advance by chunk size")
	require.NotNil(t, row.CompletedAt, "session must be marked completed after finalize")

	// The R2 object must contain the exact payload bytes.
	var storedKey string
	for k := range rig.store.completed {
		storedKey = k
		break
	}
	require.NotEmpty(t, storedKey, "a finalized object must exist in the store")
	assert.Equal(t, payload, rig.store.completed[storedKey], "stored bytes must match upload")
}

// TestUploadChunk_MultiChunkFinalizes covers the resume-style happy path:
// two PATCHes that together complete the upload. Assertions:
//   - offset advances correctly after each chunk
//   - the two chunks are concatenated in order via CompleteMultipartUpload
//   - the rolling SHA-256 matches the concatenated input
func TestUploadChunk_MultiChunkFinalizes(t *testing.T) {
	rig := setupStreamingRig(t)

	chunk1 := append([]byte{0xFF, 0xD8}, []byte("first-chunk-data")...)
	chunk2 := append([]byte("second-chunk-data"), 0xFF, 0xD9)
	total := int64(len(chunk1) + len(chunk2))

	uploadID := rig.createSession(t, "multi.bin", total)

	rr := rig.patchChunk(t, uploadID, 0, chunk1, "")
	require.Equal(t, http.StatusOK, rr.Code, "first PATCH failed: %s", rr.Body.String())

	rr = rig.patchChunk(t, uploadID, int64(len(chunk1)), chunk2, "")
	require.Equal(t, http.StatusOK, rr.Code, "second PATCH failed: %s", rr.Body.String())

	var storedKey string
	for k := range rig.store.completed {
		storedKey = k
		break
	}
	require.NotEmpty(t, storedKey)
	expected := append([]byte{}, chunk1...)
	expected = append(expected, chunk2...)
	assert.Equal(t, expected, rig.store.completed[storedKey], "concatenated bytes must match input")
}

// TestUploadChunk_PerChunkChecksumMismatch_Rejected covers the TUS
// checksum extension. A PATCH with an Upload-Checksum header that does
// not match the actual chunk body must be rejected with HTTP 460
// (TUS "Checksum Mismatch"). The session offset must NOT advance, and
// nothing must be written to R2.
func TestUploadChunk_PerChunkChecksumMismatch_Rejected(t *testing.T) {
	rig := setupStreamingRig(t)

	chunk := []byte("chunk-body-matters")
	uploadID := rig.createSession(t, "checksum.bin", int64(len(chunk)))

	// Lie about the checksum — base64 of a valid-shaped but wrong hash.
	wrongHash := make([]byte, 32)
	copy(wrongHash, []byte("not-the-real-hash"))
	wrongChecksum := base64.StdEncoding.EncodeToString(wrongHash)

	rr := rig.patchChunk(t, uploadID, 0, chunk, wrongChecksum)
	assert.Equal(t, 460, rr.Code, "TUS 460 Checksum Mismatch expected; got %d: %s", rr.Code, rr.Body.String())

	row, err := rig.sessions.GetByTUSUploadID(context.Background(), uploadID)
	require.NoError(t, err)
	assert.Equal(t, int64(0), row.UploadOffset, "offset must not advance after checksum failure")
	assert.Empty(t, rig.store.completed, "no bytes must be finalized after checksum failure")
	assert.Nil(t, row.CompletedAt, "session must not be completed after checksum failure")
}

// TestUploadChunk_PerChunkChecksumMatch_Accepted is the positive path:
// when Upload-Checksum matches the actual body, the chunk is uploaded
// and the offset advances.
func TestUploadChunk_PerChunkChecksumMatch_Accepted(t *testing.T) {
	rig := setupStreamingRig(t)

	chunk := append([]byte{0xFF, 0xD8}, []byte("chunk-with-correct-checksum")...)
	chunk = append(chunk, 0xFF, 0xD9)
	uploadID := rig.createSession(t, "checksum-ok.bin", int64(len(chunk)))

	sum := sha256.Sum256(chunk)
	correct := base64.StdEncoding.EncodeToString(sum[:])

	rr := rig.patchChunk(t, uploadID, 0, chunk, correct)
	require.Equal(t, http.StatusOK, rr.Code, "matching checksum must be accepted; got %d: %s", rr.Code, rr.Body.String())
}

// TestGetOffset_ReadsFromDB verifies HEAD returns the persisted offset
// from the session store, not an in-memory cache. Simulates a process
// that did not write the session itself (another API pod owns it).
func TestGetOffset_ReadsFromDB(t *testing.T) {
	rig := setupStreamingRig(t)

	uploadID := rig.createSession(t, "offset.bin", 1024)

	// Directly mutate the store row as if another pod advanced the upload.
	row, err := rig.sessions.GetByTUSUploadID(context.Background(), uploadID)
	require.NoError(t, err)
	require.NoError(t, rig.sessions.UpdateOffset(context.Background(), uploadID, 512))
	_ = row

	req := rig.authedRequest(http.MethodHead, "/api/v1/uploads/"+uploadID, nil)
	r := chi.NewRouter()
	rig.handler.RegisterRoutes(r)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "512", rr.Header().Get("Upload-Offset"))
	assert.Equal(t, "1024", rr.Header().Get("Upload-Length"))
}

// TestCancel_AbortsR2AndDeletesRow verifies the TUS DELETE verb aborts
// the R2 multipart upload, removes the session row, and returns 204.
func TestCancel_AbortsR2AndDeletesRow(t *testing.T) {
	rig := setupStreamingRig(t)

	uploadID := rig.createSession(t, "cancel.bin", 1024)

	// Grab the R2 multipart upload ID before cancel.
	row, err := rig.sessions.GetByTUSUploadID(context.Background(), uploadID)
	require.NoError(t, err)
	require.NotNil(t, row.R2MultipartUploadID)
	mpID := *row.R2MultipartUploadID

	req := rig.authedRequest(http.MethodDelete, "/api/v1/uploads/"+uploadID, nil)
	r := chi.NewRouter()
	rig.handler.RegisterRoutes(r)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	require.Equal(t, http.StatusNoContent, rr.Code)

	// Row must be gone.
	_, err = rig.sessions.GetByTUSUploadID(context.Background(), uploadID)
	assert.ErrorIs(t, err, repository.ErrUploadSessionNotFound, "session row must be deleted")

	// R2 upload must be marked aborted.
	rig.store.mu.Lock()
	u, ok := rig.store.uploads[mpID]
	rig.store.mu.Unlock()
	require.True(t, ok, "upload state must still be present (aborted=true)")
	assert.True(t, u.aborted, "R2 multipart upload must be aborted")
}

// TestSetTUSHeaders_HasF013Extensions verifies that the handler advertises
// the TUS extensions required by the F-013 spec compliance push:
// creation-with-upload, expiration, and checksum.
//
// Driven via a CreateSession response (which calls setTUSHeaders).
func TestSetTUSHeaders_HasF013Extensions(t *testing.T) {
	rig := setupStreamingRig(t)

	body, _ := json.Marshal(map[string]interface{}{
		"filename":     "headers.bin",
		"content_type": "image/jpeg",
		"total_size":   int64(64),
		"chunk_size":   int64(64),
	})
	req := rig.authedRequest(http.MethodPost, "/api/v1/uploads", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	rig.handler.CreateSession(rr, req)
	require.Equal(t, http.StatusCreated, rr.Code, "CreateSession failed: %s", rr.Body.String())

	ext := rr.Header().Get("Tus-Extension")
	assert.Contains(t, ext, "creation-with-upload",
		"Tus-Extension must advertise creation-with-upload (F-013 spec compliance)")
	assert.Contains(t, ext, "expiration",
		"Tus-Extension must advertise expiration (sessions expire via GC)")
	assert.Contains(t, ext, "checksum",
		"Tus-Extension must advertise checksum (per-chunk Upload-Checksum)")

	// Upload-Expires header must be RFC1123 and in the future.
	expires := rr.Header().Get("Upload-Expires")
	require.NotEmpty(t, expires, "Upload-Expires header must be set")
	ts, err := time.Parse(time.RFC1123, expires)
	require.NoError(t, err, "Upload-Expires must be RFC1123-formatted: %q", expires)
	assert.True(t, ts.After(time.Now()), "Upload-Expires must be in the future")
}

// TestFinalizeUpload_VerifiesManifestHash is the F-003 regression guarantee:
// after the wave 6 rewrite, the finalize path still verifies the actual
// uploaded bytes against the manifest's declared SHA-256. A mismatch must
// produce a 422 and leave no asset row behind. The test constructs an
// upload where the CLIENT lies about the hash in the session manifest.
func TestFinalizeUpload_HashMismatchProduces422(t *testing.T) {
	rig := setupStreamingRig(t)

	payload := []byte("the real uploaded bytes")

	// Lie: declare a manifest whose SHA-256 does not match the payload.
	// DetectedFormat must be non-empty to satisfy HasRequiredFields(); the
	// finalize path will reject on hash mismatch before the format spot-
	// check runs, so "jpeg" is fine even though the payload is not JPEG.
	manifest := &service.UploadScanManifest{
		PolicyVersion:  "v1",
		Engine:         service.ScanEngineBrowserWorker,
		EngineVersion:  "1.0.0",
		FileName:       "liar.bin",
		DeclaredType:   "image/jpeg",
		DetectedFormat: "jpeg",
		SHA256:         hex.EncodeToString(make([]byte, 32)), // 64 zero-hex chars — valid shape, wrong value
		SizeBytes:      int64(len(payload)),
		Decision:       "pass",
		RiskScore:      0.0,
	}

	body, _ := json.Marshal(map[string]interface{}{
		"filename":      "liar.bin",
		"content_type":  "image/jpeg",
		"total_size":    int64(len(payload)),
		"chunk_size":    int64(len(payload)),
		"scan_manifest": manifest,
	})
	req := rig.authedRequest(http.MethodPost, "/api/v1/uploads", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	rig.handler.CreateSession(rr, req)
	require.Equal(t, http.StatusCreated, rr.Code, "CreateSession should accept pass-decision manifest: %s", rr.Body.String())

	var resp struct {
		UploadID string `json:"upload_id"`
	}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))

	rr = rig.patchChunk(t, resp.UploadID, 0, payload, "")
	assert.Equal(t, http.StatusUnprocessableEntity, rr.Code,
		"declared SHA-256 != actual bytes must fail finalize with 422; got %d: %s", rr.Code, rr.Body.String())
	assert.Contains(t, rr.Body.String(), "SCAN_HASH_MISMATCH",
		"response body must identify SCAN_HASH_MISMATCH as the cause")
}

func TestCreateSession_RejectsNonImageContentType(t *testing.T) {
	rig := setupStreamingRig(t)

	body, _ := json.Marshal(map[string]interface{}{
		"filename":     "invoice.jpg",
		"content_type": "application/pdf",
		"total_size":   int64(128),
		"chunk_size":   int64(64),
	})
	req := rig.authedRequest(http.MethodPost, "/api/v1/uploads", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	rig.handler.CreateSession(rr, req)

	assert.Equal(t, http.StatusUnprocessableEntity, rr.Code)
	assert.Contains(t, rr.Body.String(), "UNSUPPORTED_UPLOAD_TYPE")
	assert.Empty(t, rig.store.uploads, "storage multipart upload must not be created for non-images")
}

func TestFinalizeUpload_RejectsDisguisedImageWithoutManifest(t *testing.T) {
	rig := setupStreamingRig(t)

	payload := []byte("%PDF-1.7 not really a jpeg")
	uploadID := rig.createSession(t, "fake.jpg", int64(len(payload)))

	rr := rig.patchChunk(t, uploadID, 0, payload, "")

	assert.Equal(t, http.StatusUnprocessableEntity, rr.Code)
	assert.Contains(t, rr.Body.String(), "SCAN_HASH_MISMATCH")
	for key := range rig.store.deleted {
		assert.True(t, rig.store.deleted[key], "assembled object must be deleted after failed finalize verification")
		return
	}
	t.Fatal("expected disguised object to be deleted")
}

// Guard against import cycle / silent import drop.
var _ = fmt.Sprintf
