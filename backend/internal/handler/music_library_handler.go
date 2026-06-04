package handler

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

// MusicLibraryHandler serves the workspace-level music library
// (Gallery Enhancements June 2026). Audio uploads are ordinary assets in the
// `assets` table (Option A — no separate media table, so quota accounting and
// the WebP/derivative-free storage path are reused), distinguished only by
// content_type LIKE 'audio/%'. This handler is the audio-only management
// surface:
//
//   - ListLibrary (GET /api/v1/music): lists the workspace's audio assets,
//     newest first, as the slideshow-track picker's source.
//   - DeleteTrack (DELETE /api/v1/music/{id}): soft-deletes a track (reclaiming
//     quota via the shared asset delete path) and nulls every gallery in the
//     workspace that pointed at it so no gallery is left referencing a deleted
//     track.
//
// Public streaming of the selected track lives in PublicGalleryHandler
// .GetGalleryMusic and is intentionally untouched.
type MusicLibraryHandler struct {
	audio     musicAudioLister
	deleter   musicTrackDeleter
	galleries musicGalleryClearer
}

// musicAudioLister lists a workspace's audio assets and resolves a single
// workspace-scoped asset (used to confirm a delete target is a non-deleted audio
// asset in the caller's tenant). Satisfied by *repository.AssetRepo.
type musicAudioLister interface {
	ListAudioByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]repository.Asset, error)
	GetByIDAndWorkspace(ctx context.Context, id, workspaceID uuid.UUID) (*repository.Asset, error)
}

// musicTrackDeleter soft-deletes an asset scoped to a workspace, reclaiming
// storage quota through the shared asset-delete accounting path. Satisfied by
// *service.AssetService.
type musicTrackDeleter interface {
	SoftDeleteForWorkspace(ctx context.Context, id, workspaceID uuid.UUID) error
}

// musicGalleryClearer nulls galleries.music_asset_id for every gallery in a
// workspace that referenced a (now deleted) track. Satisfied by
// *repository.GalleryRepo.
type musicGalleryClearer interface {
	ClearMusicAsset(ctx context.Context, workspaceID, assetID uuid.UUID) error
}

// NewMusicLibraryHandler constructs the music library handler from its three
// narrow dependencies.
func NewMusicLibraryHandler(audio musicAudioLister, deleter musicTrackDeleter, galleries musicGalleryClearer) *MusicLibraryHandler {
	return &MusicLibraryHandler{audio: audio, deleter: deleter, galleries: galleries}
}

// musicTrack is the wire shape for one library track. It exposes only the
// fields the picker needs — never the storage key — matching the GET
// /api/v1/music contract exactly.
type musicTrack struct {
	ID          uuid.UUID `json:"id"`
	Filename    string    `json:"filename"`
	ContentType string    `json:"content_type"`
	SizeBytes   int64     `json:"size_bytes"`
	CreatedAt   time.Time `json:"created_at"`
}

// musicLibraryResponse is the GET /api/v1/music envelope.
type musicLibraryResponse struct {
	Tracks []musicTrack `json:"tracks"`
}

// ListLibrary handles GET /api/v1/music — lists the workspace's audio assets,
// newest first. Workspace-scoped via JWT claims. Returns an empty list (not
// 404) when the workspace has no tracks.
func (h *MusicLibraryHandler) ListLibrary(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}

	assets, err := h.audio.ListAudioByWorkspace(r.Context(), workspaceID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	tracks := make([]musicTrack, 0, len(assets))
	for i := range assets {
		a := assets[i]
		tracks = append(tracks, musicTrack{
			ID:          a.ID,
			Filename:    a.Filename,
			ContentType: a.ContentType,
			SizeBytes:   a.SizeBytes,
			CreatedAt:   a.CreatedAt,
		})
	}

	respondJSON(w, http.StatusOK, musicLibraryResponse{Tracks: tracks})
}

// DeleteTrack handles DELETE /api/v1/music/{id} — soft-deletes a workspace audio
// asset (reclaiming quota) and nulls galleries.music_asset_id on every gallery
// in the workspace that referenced it. Returns 404 when {id} is not a
// non-deleted audio asset in the caller's workspace (cross-tenant safe).
func (h *MusicLibraryHandler) DeleteTrack(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid track id"}`, http.StatusBadRequest)
		return
	}

	// Confirm the id resolves to a non-deleted AUDIO asset in this workspace.
	// GetByIDAndWorkspace already scopes by workspace_id and excludes
	// soft-deleted rows, so a foreign-tenant / missing id returns nil → 404;
	// the audio/* check rejects a photo id with the same 404 so existence is
	// never disclosed across content types either.
	asset, err := h.audio.GetByIDAndWorkspace(r.Context(), id, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if asset == nil || !strings.HasPrefix(asset.ContentType, "audio/") {
		http.Error(w, `{"error":"track not found"}`, http.StatusNotFound)
		return
	}

	// Soft-delete the asset (workspace-scoped; reclaims storage quota via the
	// shared asset-delete accounting path).
	if err := h.deleter.SoftDeleteForWorkspace(r.Context(), id, workspaceID); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}

	// Cascade: null the pointer on every gallery in the workspace that used this
	// track so no gallery is left referencing a deleted asset.
	if err := h.galleries.ClearMusicAsset(r.Context(), workspaceID, id); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
