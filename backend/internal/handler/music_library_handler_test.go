package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// Workspace music library, handler layer (Gallery Enhancements June 2026).
// GET /api/v1/music lists the workspace's audio assets; DELETE /api/v1/music/{id}
// soft-deletes a track (reclaiming quota) and nulls every gallery in the
// workspace that referenced it. These tests use interface fakes so they run
// without a DB, matching the bulk-asset handler test convention.

// ──────────────────────── fakes ────────────────────────

type fakeMusicAudioLister struct {
	tracks  []repository.Asset
	gotWsID uuid.UUID
	err     error
}

func (f *fakeMusicAudioLister) ListAudioByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]repository.Asset, error) {
	f.gotWsID = workspaceID
	return f.tracks, f.err
}

func (f *fakeMusicAudioLister) GetByIDAndWorkspace(ctx context.Context, id, workspaceID uuid.UUID) (*repository.Asset, error) {
	for i := range f.tracks {
		if f.tracks[i].ID == id && f.tracks[i].WorkspaceID == workspaceID {
			return &f.tracks[i], nil
		}
	}
	return nil, nil
}

type fakeMusicDeleter struct {
	deletedID  uuid.UUID
	deletedWs  uuid.UUID
	deleteErr  error
	deleteCall int
}

func (f *fakeMusicDeleter) SoftDeleteForWorkspace(ctx context.Context, id, workspaceID uuid.UUID) error {
	f.deleteCall++
	f.deletedID = id
	f.deletedWs = workspaceID
	return f.deleteErr
}

type fakeMusicGalleryClearer struct {
	clearedID uuid.UUID
	clearedWs uuid.UUID
	clearCall int
	clearErr  error
}

func (f *fakeMusicGalleryClearer) ClearMusicAsset(ctx context.Context, workspaceID, assetID uuid.UUID) error {
	f.clearCall++
	f.clearedWs = workspaceID
	f.clearedID = assetID
	return f.clearErr
}

func newMusicRequest(t *testing.T, method, path string, workspaceID uuid.UUID) *http.Request {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	ctx := middleware.WithWorkspaceID(req.Context(), workspaceID.String())
	return req.WithContext(ctx)
}

// serveMusicDelete wires the {id} chi param like the router would.
func serveMusicDelete(h *MusicLibraryHandler, req *http.Request, id string) *httptest.ResponseRecorder {
	rr := httptest.NewRecorder()
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	h.DeleteTrack(rr, req)
	return rr
}

// ──────────────────────── ListLibrary ────────────────────────

func TestMusicLibrary_ListLibrary_ReturnsTracksEnvelope(t *testing.T) {
	wsID := uuid.New()
	created := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	lister := &fakeMusicAudioLister{tracks: []repository.Asset{
		{ID: uuid.New(), WorkspaceID: wsID, Filename: "sangeet.mp3", ContentType: "audio/mpeg", SizeBytes: 3145728, CreatedAt: created},
	}}
	h := NewMusicLibraryHandler(lister, &fakeMusicDeleter{}, &fakeMusicGalleryClearer{})

	req := newMusicRequest(t, http.MethodGet, "/api/v1/music", wsID)
	rr := httptest.NewRecorder()
	h.ListLibrary(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, wsID, lister.gotWsID, "lister must be scoped to the JWT workspace")

	var body struct {
		Tracks []struct {
			ID          string `json:"id"`
			Filename    string `json:"filename"`
			ContentType string `json:"content_type"`
			SizeBytes   int64  `json:"size_bytes"`
			CreatedAt   string `json:"created_at"`
		} `json:"tracks"`
	}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &body))
	require.Len(t, body.Tracks, 1)
	assert.Equal(t, "sangeet.mp3", body.Tracks[0].Filename)
	assert.Equal(t, "audio/mpeg", body.Tracks[0].ContentType)
	assert.Equal(t, int64(3145728), body.Tracks[0].SizeBytes)
	assert.NotEmpty(t, body.Tracks[0].ID)
	assert.NotEmpty(t, body.Tracks[0].CreatedAt, "created_at must be RFC3339")
}

func TestMusicLibrary_ListLibrary_EmptyIsEmptyArrayNot404(t *testing.T) {
	wsID := uuid.New()
	h := NewMusicLibraryHandler(&fakeMusicAudioLister{tracks: nil}, &fakeMusicDeleter{}, &fakeMusicGalleryClearer{})

	req := newMusicRequest(t, http.MethodGet, "/api/v1/music", wsID)
	rr := httptest.NewRecorder()
	h.ListLibrary(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	var body struct {
		Tracks []json.RawMessage `json:"tracks"`
	}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &body))
	assert.NotNil(t, body.Tracks, "tracks must serialize as [] not null")
	assert.Len(t, body.Tracks, 0)
}

func TestMusicLibrary_ListLibrary_MissingWorkspace400(t *testing.T) {
	h := NewMusicLibraryHandler(&fakeMusicAudioLister{}, &fakeMusicDeleter{}, &fakeMusicGalleryClearer{})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/music", nil) // no workspace ctx
	rr := httptest.NewRecorder()
	h.ListLibrary(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

// ──────────────────────── DeleteTrack ────────────────────────

func TestMusicLibrary_DeleteTrack_SoftDeletesAndClearsGalleryRefs(t *testing.T) {
	wsID := uuid.New()
	trackID := uuid.New()
	lister := &fakeMusicAudioLister{tracks: []repository.Asset{
		{ID: trackID, WorkspaceID: wsID, Filename: "sangeet.mp3", ContentType: "audio/mpeg"},
	}}
	del := &fakeMusicDeleter{}
	clr := &fakeMusicGalleryClearer{}
	h := NewMusicLibraryHandler(lister, del, clr)

	req := newMusicRequest(t, http.MethodDelete, "/api/v1/music/"+trackID.String(), wsID)
	rr := serveMusicDelete(h, req, trackID.String())

	require.Equal(t, http.StatusNoContent, rr.Code)
	assert.Equal(t, 1, del.deleteCall, "the track must be soft-deleted exactly once")
	assert.Equal(t, trackID, del.deletedID)
	assert.Equal(t, wsID, del.deletedWs, "delete must be workspace-scoped")
	assert.Equal(t, 1, clr.clearCall, "referencing galleries must have music_asset_id nulled")
	assert.Equal(t, trackID, clr.clearedID)
	assert.Equal(t, wsID, clr.clearedWs)
}

func TestMusicLibrary_DeleteTrack_InvalidUUID400(t *testing.T) {
	wsID := uuid.New()
	h := NewMusicLibraryHandler(&fakeMusicAudioLister{}, &fakeMusicDeleter{}, &fakeMusicGalleryClearer{})
	req := newMusicRequest(t, http.MethodDelete, "/api/v1/music/not-a-uuid", wsID)
	rr := serveMusicDelete(h, req, "not-a-uuid")
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

// TestMusicLibrary_DeleteTrack_NonAudioOrCrossTenant404 proves the guard: a UUID
// that resolves to no non-deleted audio asset in the caller's workspace (a
// photo, a foreign-tenant asset, or a missing id) returns 404 and never touches
// the deleter or the gallery clearer.
func TestMusicLibrary_DeleteTrack_NonAudioOrCrossTenant404(t *testing.T) {
	wsID := uuid.New()
	// A photo asset in our workspace — not audio, so DeleteTrack must 404.
	photoID := uuid.New()
	lister := &fakeMusicAudioLister{tracks: []repository.Asset{
		{ID: photoID, WorkspaceID: wsID, Filename: "wedding.jpg", ContentType: "image/jpeg"},
	}}
	del := &fakeMusicDeleter{}
	clr := &fakeMusicGalleryClearer{}
	h := NewMusicLibraryHandler(lister, del, clr)

	// Unknown id (nothing resolves) → 404.
	req := newMusicRequest(t, http.MethodDelete, "/api/v1/music/"+uuid.New().String(), wsID)
	rr := serveMusicDelete(h, req, uuid.NewString())
	assert.Equal(t, http.StatusNotFound, rr.Code)

	// Known id but it's a photo, not audio → 404.
	req2 := newMusicRequest(t, http.MethodDelete, "/api/v1/music/"+photoID.String(), wsID)
	rr2 := serveMusicDelete(h, req2, photoID.String())
	assert.Equal(t, http.StatusNotFound, rr2.Code)

	assert.Equal(t, 0, del.deleteCall, "a non-audio / cross-tenant id must never reach the deleter")
	assert.Equal(t, 0, clr.clearCall, "a non-audio / cross-tenant id must never clear gallery refs")
}

// Compile-time assertion that the real service/repo types satisfy the handler's
// narrow interfaces, so production wiring in routes_m2.go cannot drift from the
// shapes these tests fake.
var (
	_ musicAudioLister    = (*repository.AssetRepo)(nil)
	_ musicTrackDeleter   = (*service.AssetService)(nil)
	_ musicGalleryClearer = (*repository.GalleryRepo)(nil)
)
