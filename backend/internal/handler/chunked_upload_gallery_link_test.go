package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
)

// ─────────────────────────────────────────────────────────────────────────────
// S3-G4 / AREA-UPLOADER-3 — server-side gallery linkage.
//
// A finalized + charged upload must be linked to its destination gallery by the
// SERVER, in the same flow as the asset insert, rather than by a best-effort
// client call after finalize. These tests cover:
//   1. finalizeUpload with a session gallery_id calls the linker server-side.
//   2. a cross-workspace gallery_id at CreateSession is rejected (404) and not
//      persisted on the session.
//   3. a valid same-workspace gallery_id at CreateSession is persisted.
// ─────────────────────────────────────────────────────────────────────────────

// fakeGalleryLinker records LinkFinalizedAsset calls.
type fakeGalleryLinker struct {
	mu    sync.Mutex
	calls []linkCall
	err   error
}

type linkCall struct {
	galleryID   uuid.UUID
	assetID     uuid.UUID
	workspaceID uuid.UUID
}

func (f *fakeGalleryLinker) LinkFinalizedAsset(_ context.Context, galleryID, assetID, workspaceID uuid.UUID) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, linkCall{galleryID, assetID, workspaceID})
	return f.err
}

// fakeGalleryResolver returns a fixed gallery (or nil) for GetByID.
type fakeGalleryResolver struct {
	gallery *repository.Gallery
	err     error
}

func (f *fakeGalleryResolver) GetByID(_ context.Context, _ uuid.UUID) (*repository.Gallery, error) {
	return f.gallery, f.err
}

// fakeAlbumResolver returns a fixed album (or nil) for GetByID.
type fakeAlbumResolver struct {
	album *repository.Album
	err   error
}

func (f *fakeAlbumResolver) GetByID(_ context.Context, _ uuid.UUID) (*repository.Album, error) {
	return f.album, f.err
}

// TestFinalize_WithSessionGalleryID_LinksServerSide is the core P0 guard: when
// the session row carries a gallery_id, finalize must link the freshly-created
// asset into that gallery via the linker — no client call required. Before the
// fix the asset was created but never linked server-side.
func TestFinalize_WithSessionGalleryID_LinksServerSide(t *testing.T) {
	store := newFakeMultipartStore()
	sessions := newFakeSessionStore()
	linker := &fakeGalleryLinker{}

	workspaceID := uuid.New()
	galleryID := uuid.New()
	tusUploadID := uuid.New().String()
	payload := append([]byte{0xFF, 0xD8}, []byte("intact object bytes")...)
	payload = append(payload, 0xFF, 0xD9)

	row := &repository.UploadSession{
		WorkspaceID: workspaceID,
		UserID:      uuid.New(),
		TUSUploadID: tusUploadID,
		Filename:    "wedding.jpg",
		ContentType: "image/jpeg",
		TotalSize:   int64(len(payload)),
		GalleryID:   &galleryID,
	}
	storageKey, _ := handler.DeriveKeyAndUploadIDForTest(row)
	mpID := seedCompletableUpload(t, store, storageKey, payload)
	row.R2MultipartUploadID = &mpID
	partsJSON, _ := json.Marshal([]repository.UploadPartETag{
		{PartNumber: 1, ETag: "etag-" + mpID + "-1", Size: int64(len(payload))},
	})
	row.R2PartETags = partsJSON

	var createdAssetID uuid.UUID
	res, err := handler.FinalizeUploadWithLinkerForTest(store, sessions, linker, row,
		func(_ context.Context, a *repository.Asset) error {
			createdAssetID = a.ID
			return nil
		})
	require.NoError(t, err, "finalize must succeed: %v", err)
	require.NotNil(t, res)

	linker.mu.Lock()
	defer linker.mu.Unlock()
	require.Len(t, linker.calls, 1, "finalize must link the asset into the gallery server-side exactly once")
	assert.Equal(t, galleryID, linker.calls[0].galleryID, "link must target the session's gallery")
	assert.Equal(t, workspaceID, linker.calls[0].workspaceID, "link must carry the session workspace for the tenant guard")
	assert.Equal(t, createdAssetID, linker.calls[0].assetID, "link must reference the just-created asset id")
}

// TestFinalize_NoSessionGalleryID_DoesNotLink is the negative control: a session
// without a gallery_id (legacy client-link flow) must NOT invoke the linker.
func TestFinalize_NoSessionGalleryID_DoesNotLink(t *testing.T) {
	store := newFakeMultipartStore()
	sessions := newFakeSessionStore()
	linker := &fakeGalleryLinker{}

	payload := append([]byte{0xFF, 0xD8}, []byte("no gallery")...)
	payload = append(payload, 0xFF, 0xD9)
	row := &repository.UploadSession{
		WorkspaceID: uuid.New(),
		UserID:      uuid.New(),
		TUSUploadID: uuid.New().String(),
		Filename:    "loose.jpg",
		ContentType: "image/jpeg",
		TotalSize:   int64(len(payload)),
		// GalleryID intentionally nil.
	}
	storageKey, _ := handler.DeriveKeyAndUploadIDForTest(row)
	mpID := seedCompletableUpload(t, store, storageKey, payload)
	row.R2MultipartUploadID = &mpID
	partsJSON, _ := json.Marshal([]repository.UploadPartETag{
		{PartNumber: 1, ETag: "etag-" + mpID + "-1", Size: int64(len(payload))},
	})
	row.R2PartETags = partsJSON

	_, err := handler.FinalizeUploadWithLinkerForTest(store, sessions, linker, row,
		func(_ context.Context, _ *repository.Asset) error { return nil })
	require.NoError(t, err)

	linker.mu.Lock()
	defer linker.mu.Unlock()
	assert.Empty(t, linker.calls, "a session without a gallery_id must not trigger a server-side link")
}

// TestFinalize_GalleryLinkFailure_IsNonFatal: a link error must not fail the
// upload (the asset exists + was charged; failing would force a refund/delete).
func TestFinalize_GalleryLinkFailure_IsNonFatal(t *testing.T) {
	store := newFakeMultipartStore()
	sessions := newFakeSessionStore()
	linker := &fakeGalleryLinker{err: assertAnErr()}

	galleryID := uuid.New()
	payload := append([]byte{0xFF, 0xD8}, []byte("link will fail")...)
	payload = append(payload, 0xFF, 0xD9)
	row := &repository.UploadSession{
		WorkspaceID: uuid.New(),
		UserID:      uuid.New(),
		TUSUploadID: uuid.New().String(),
		Filename:    "x.jpg",
		ContentType: "image/jpeg",
		TotalSize:   int64(len(payload)),
		GalleryID:   &galleryID,
	}
	storageKey, _ := handler.DeriveKeyAndUploadIDForTest(row)
	mpID := seedCompletableUpload(t, store, storageKey, payload)
	row.R2MultipartUploadID = &mpID
	partsJSON, _ := json.Marshal([]repository.UploadPartETag{
		{PartNumber: 1, ETag: "etag-" + mpID + "-1", Size: int64(len(payload))},
	})
	row.R2PartETags = partsJSON

	_, err := handler.FinalizeUploadWithLinkerForTest(store, sessions, linker, row,
		func(_ context.Context, _ *repository.Asset) error { return nil })
	require.NoError(t, err, "a gallery-link failure must NOT fail the finalized upload")

	store.mu.Lock()
	deleted := store.deleted[storageKey]
	store.mu.Unlock()
	assert.False(t, deleted, "the object must NOT be deleted on a non-fatal link failure")
}

// ─── CreateSession workspace-ownership validation ───────────────────────────

// createSessionWithGallery POSTs a CreateSession with a gallery_id through the
// supplied handler and returns the recorder.
func createSessionWithGallery(t *testing.T, h *handler.ChunkedUploadHandler, workspaceID, userID uuid.UUID, galleryID *uuid.UUID) *httptest.ResponseRecorder {
	t.Helper()
	body := map[string]interface{}{
		"filename":     "photo.jpg",
		"content_type": "image/jpeg",
		"total_size":   int64(128),
		"chunk_size":   int64(64),
	}
	if galleryID != nil {
		body["gallery_id"] = galleryID.String()
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	claims := map[string]interface{}{
		"sub":          userID.String(),
		"workspace_id": workspaceID.String(),
	}
	ctx := middleware.WithJWTClaims(req.Context(), claims)
	ctx = middleware.WithWorkspaceID(ctx, workspaceID.String())
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	h.CreateSession(rr, req)
	return rr
}

// TestCreateSession_CrossWorkspaceGalleryID_Rejected: a gallery_id that belongs
// to ANOTHER workspace must be rejected with 404 and the session must NOT be
// created — the cross-tenant binding guard for AREA-UPLOADER-3.
func TestCreateSession_CrossWorkspaceGalleryID_Rejected(t *testing.T) {
	store := newFakeMultipartStore()
	sessions := newFakeSessionStore()
	linker := &fakeGalleryLinker{}

	callerWorkspace := uuid.New()
	otherWorkspace := uuid.New()
	galleryID := uuid.New()

	// The resolver returns a gallery owned by a DIFFERENT workspace.
	galleries := &fakeGalleryResolver{gallery: &repository.Gallery{ID: galleryID, WorkspaceID: otherWorkspace}}
	h := handler.NewHandlerWithGalleryLinkageForTest(store, sessions, galleries, &fakeAlbumResolver{}, linker)

	rr := createSessionWithGallery(t, h, callerWorkspace, uuid.New(), &galleryID)

	assert.Equal(t, http.StatusNotFound, rr.Code, "cross-workspace gallery_id must be rejected with 404; body=%s", rr.Body.String())

	// No session row should have been persisted.
	sessions.mu.Lock()
	defer sessions.mu.Unlock()
	assert.Empty(t, sessions.rows, "no upload session may be created for a cross-workspace gallery_id")
}

// TestCreateSession_SameWorkspaceGalleryID_Persisted: a valid gallery_id owned
// by the caller's workspace must be accepted and persisted on the session.
func TestCreateSession_SameWorkspaceGalleryID_Persisted(t *testing.T) {
	store := newFakeMultipartStore()
	sessions := newFakeSessionStore()
	linker := &fakeGalleryLinker{}

	workspaceID := uuid.New()
	galleryID := uuid.New()

	galleries := &fakeGalleryResolver{gallery: &repository.Gallery{ID: galleryID, WorkspaceID: workspaceID}}
	h := handler.NewHandlerWithGalleryLinkageForTest(store, sessions, galleries, &fakeAlbumResolver{}, linker)

	rr := createSessionWithGallery(t, h, workspaceID, uuid.New(), &galleryID)
	require.Equal(t, http.StatusCreated, rr.Code, "valid same-workspace gallery_id must be accepted; body=%s", rr.Body.String())

	var resp struct {
		UploadID string `json:"upload_id"`
	}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))

	row, err := sessions.GetByTUSUploadID(context.Background(), resp.UploadID)
	require.NoError(t, err)
	require.NotNil(t, row.GalleryID, "gallery_id must be persisted on the session row")
	assert.Equal(t, galleryID, *row.GalleryID)
}

// assertAnErr returns a non-nil error for the link-failure test without pulling
// in errors just for one literal.
func assertAnErr() error { return errLinkBoom }

var errLinkBoom = &boomErr{}

type boomErr struct{}

func (*boomErr) Error() string { return "link boom" }
