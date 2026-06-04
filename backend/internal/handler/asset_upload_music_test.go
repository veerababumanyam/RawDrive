package handler_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/storage"
)

// ─────────────────────────────────────────────────────────────────────────────
// Music-library storage-folder isolation tests for POST /api/v1/assets.
//
// A music-library upload (the optional `purpose=music` multipart field) must
// (a) land under a dedicated per-workspace {ws}/music/{id}/original{ext} key,
// (b) be rejected with 400 unless it is an audio/* file (defense-in-depth), and
// (c) leave non-music (e.g. image) uploads on the original {ws}/{id}/... layout.
//
// These tests avoid a DB by using a fake storage.Provider whose Put captures
// the computed key and then returns an error — the upload service computes the
// key and calls storage.Put BEFORE it ever touches the AssetRepo, so the key is
// observable without a persistence round-trip. The 415-style audio rejection
// for purpose=music happens in the handler before the service is invoked, so it
// needs no storage at all.
// ─────────────────────────────────────────────────────────────────────────────

// keyCapturingStore is a storage.Provider that records the key passed to Put
// and then fails, short-circuiting the upload service before it reaches the DB.
type keyCapturingStore struct {
	gotKey string
}

var errKeyCaptured = errors.New("key captured (test sentinel)")

func (s *keyCapturingStore) Put(_ context.Context, key string, _ io.Reader, _ int64, _ string) error {
	s.gotKey = key
	return errKeyCaptured
}

func (s *keyCapturingStore) Get(_ context.Context, _ string) (io.ReadCloser, error) {
	return nil, errors.New("not implemented")
}
func (s *keyCapturingStore) Delete(_ context.Context, _ string) error { return nil }
func (s *keyCapturingStore) PresignURL(_ context.Context, _ string, _ storage.PresignOptions) (string, error) {
	return "", errors.New("not implemented")
}
func (s *keyCapturingStore) HealthCheck() storage.HealthStatus {
	return storage.HealthStatus{Status: "ok", Driver: "fake"}
}

// newAssetUploadMultipart builds a multipart POST /api/v1/assets request with a
// single file part (given filename, bytes, and Content-Type) and an optional
// `purpose` form field.
func newAssetUploadMultipart(
	t *testing.T,
	filename, contentType string,
	body []byte,
	purpose string,
	workspaceID, userID uuid.UUID,
) *http.Request {
	t.Helper()

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	// Build the file part with an explicit Content-Type header so the handler's
	// header.Header.Get("Content-Type") reflects the desired type.
	hdr := make(map[string][]string)
	hdr["Content-Disposition"] = []string{`form-data; name="file"; filename="` + filename + `"`}
	hdr["Content-Type"] = []string{contentType}
	fw, err := mw.CreatePart(hdr)
	require.NoError(t, err)
	_, _ = fw.Write(body)

	if purpose != "" {
		require.NoError(t, mw.WriteField("purpose", purpose))
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

// TestAssetUpload_MusicPurpose_StoredUnderMusicFolder asserts that an
// audio upload tagged purpose=music is written to {ws}/music/{id}/original.mp3.
func TestAssetUpload_MusicPurpose_StoredUnderMusicFolder(t *testing.T) {
	store := &keyCapturingStore{}
	uploadSvc := service.NewUploadService(store, nil, nil)
	h := handler.NewAssetHandler(nil, uploadSvc)

	wsID := uuid.New()
	uID := uuid.New()

	req := newAssetUploadMultipart(t, "sangeet.mp3", "audio/mpeg", []byte("ID3-fake-audio"), "music", wsID, uID)
	rr := httptest.NewRecorder()
	h.Upload(rr, req)

	// The upload service fails after capturing the key (fake store returns an
	// error), so the handler responds 500 — but the key is what we assert on.
	require.NotEmpty(t, store.gotKey, "storage.Put was never called; body: %s", rr.Body.String())
	assert.True(t, strings.HasPrefix(store.gotKey, wsID.String()+"/music/"),
		"music upload must be stored under {ws}/music/; got %q", store.gotKey)
	assert.Equal(t, wsID.String()+"/music/", store.gotKey[:len(wsID.String()+"/music/")])
	assert.True(t, strings.HasSuffix(store.gotKey, "/original.mp3"),
		"expected /original.mp3 suffix; got %q", store.gotKey)
}

// TestAssetUpload_MusicPurpose_NonAudioRejected asserts the defense-in-depth
// audio check: purpose=music with a non-audio file is a 400 and never reaches
// the storage layer.
func TestAssetUpload_MusicPurpose_NonAudioRejected(t *testing.T) {
	store := &keyCapturingStore{}
	uploadSvc := service.NewUploadService(store, nil, nil)
	h := handler.NewAssetHandler(nil, uploadSvc)

	wsID := uuid.New()
	uID := uuid.New()

	req := newAssetUploadMultipart(t, "wedding.jpg", "image/jpeg", []byte("fake-jpeg"), "music", wsID, uID)
	rr := httptest.NewRecorder()
	h.Upload(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code,
		"non-audio music upload must be 400; got %d, body %s", rr.Code, rr.Body.String())
	assert.Contains(t, rr.Body.String(), "MUSIC_MUST_BE_AUDIO")
	assert.Empty(t, store.gotKey, "rejected upload must never reach storage")
}

// TestAssetUpload_NoPurpose_KeepsOriginalLayout asserts a normal (image) upload
// with no purpose field is stored under the original {ws}/{id}/original{ext}
// layout — no /music/ prefix — guarding against a regression of the default.
func TestAssetUpload_NoPurpose_KeepsOriginalLayout(t *testing.T) {
	store := &keyCapturingStore{}
	uploadSvc := service.NewUploadService(store, nil, nil)
	h := handler.NewAssetHandler(nil, uploadSvc)

	wsID := uuid.New()
	uID := uuid.New()

	req := newAssetUploadMultipart(t, "wedding_001.jpg", "image/jpeg", []byte("fake-jpeg"), "", wsID, uID)
	rr := httptest.NewRecorder()
	h.Upload(rr, req)

	require.NotEmpty(t, store.gotKey, "storage.Put was never called; body: %s", rr.Body.String())
	assert.True(t, strings.HasPrefix(store.gotKey, wsID.String()+"/"),
		"asset must be stored under its workspace; got %q", store.gotKey)
	assert.NotContains(t, store.gotKey, "/music/",
		"non-music upload must NOT be nested under /music/; got %q", store.gotKey)
	assert.True(t, strings.HasSuffix(store.gotKey, "/original.jpg"),
		"expected /original.jpg suffix; got %q", store.gotKey)
}
