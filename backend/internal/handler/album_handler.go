package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// AlbumHandler handles album HTTP requests.
type AlbumHandler struct {
	albumSvc *service.AlbumService

	// assetBatch is the bulk asset-read seam for ?include_assets=true (Q-2b),
	// mirroring GalleryHandler. Optional: when nil, enrichAlbumAssets falls back
	// to the pool, and when neither is wired it degrades to nil-embedded rows.
	// Tests inject a counting fake via WithAssetBatchSource — the same seam the
	// gallery (PERF-23) and public (F-029) list paths use.
	assetBatch publicAssetBatchSource
	pool       *pgxpool.Pool
}

// NewAlbumHandler creates a new AlbumHandler.
func NewAlbumHandler(svc *service.AlbumService) *AlbumHandler {
	return &AlbumHandler{albumSvc: svc}
}

// WithPool injects DB access so ?include_assets=true can bulk-hydrate album
// assets via the pool-backed poolAssetBatchSource. Chainable.
func (h *AlbumHandler) WithPool(pool *pgxpool.Pool) *AlbumHandler {
	h.pool = pool
	return h
}

// WithAssetBatchSource overrides the bulk asset lookup used by
// ?include_assets=true. Production wires the pool-backed poolAssetBatchSource
// (via WithPool); tests inject an in-memory counting fake. Mirrors the gallery
// handler's seam so both list paths share one N+1-free contract. Chainable.
func (h *AlbumHandler) WithAssetBatchSource(src publicAssetBatchSource) *AlbumHandler {
	h.assetBatch = src
	return h
}

// albumAssetWithAsset is an album-asset membership row with its asset record
// embedded inline, returned when ?include_assets=true so the owner gallery
// preview hydrates a whole album from one response instead of looping getAsset()
// per asset (Q-2b). The embedded AlbumAsset keeps the same JSON shape the
// un-enriched path returns, plus an "asset" field (null when the asset is
// unavailable).
type albumAssetWithAsset struct {
	repository.AlbumAsset
	Asset *repository.Asset `json:"asset"`
}

// embedAlbumAssets attaches each asset to its membership row, preserving the
// album's position order (it iterates the ordered membership slice and looks
// each asset up by id). Assets absent from `assets` embed as nil.
func embedAlbumAssets(members []repository.AlbumAsset, assets []*repository.Asset) []albumAssetWithAsset {
	byID := make(map[uuid.UUID]*repository.Asset, len(assets))
	for _, a := range assets {
		byID[a.ID] = a
	}
	out := make([]albumAssetWithAsset, 0, len(members))
	for _, m := range members {
		out = append(out, albumAssetWithAsset{AlbumAsset: m, Asset: byID[m.AssetID]})
	}
	return out
}

// enrichAlbumAssets hydrates membership rows with their assets in a single bulk
// query (Q-2b). It prefers the injected batch source, falls back to the request
// pool, and degrades to nil-embedded rows when neither is wired (the client then
// falls back to its own hydration).
func (h *AlbumHandler) enrichAlbumAssets(ctx context.Context, members []repository.AlbumAsset) ([]albumAssetWithAsset, error) {
	batch := h.assetBatch
	if batch == nil && h.pool != nil {
		batch = poolAssetBatchSource{pool: h.pool}
	}
	if batch == nil {
		return embedAlbumAssets(members, nil), nil
	}

	ids := make([]uuid.UUID, 0, len(members))
	for _, m := range members {
		ids = append(ids, m.AssetID)
	}
	assets, err := batch.GetByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	return embedAlbumAssets(members, assets), nil
}

func (h *AlbumHandler) requireGalleryInWorkspace(w http.ResponseWriter, r *http.Request, galleryID uuid.UUID) (uuid.UUID, bool) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return uuid.Nil, false
	}
	matches, err := h.albumSvc.GalleryBelongsToWorkspace(r.Context(), galleryID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return uuid.Nil, false
	}
	if !matches {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return uuid.Nil, false
	}
	return workspaceID, true
}

func (h *AlbumHandler) requireGalleryReadable(w http.ResponseWriter, r *http.Request, galleryID uuid.UUID) (uuid.UUID, bool) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return uuid.Nil, false
	}
	readable, err := galleryReadableByWorkspace(r.Context(), h.pool, galleryID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return uuid.Nil, false
	}
	if !readable {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return uuid.Nil, false
	}
	return workspaceID, true
}

func (h *AlbumHandler) requireAlbumInWorkspace(w http.ResponseWriter, r *http.Request, albumID uuid.UUID) (*repository.Album, uuid.UUID, bool) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return nil, uuid.Nil, false
	}
	album, err := h.albumSvc.GetByIDForWorkspace(r.Context(), albumID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return nil, uuid.Nil, false
	}
	if album == nil {
		http.Error(w, `{"error":"album not found"}`, http.StatusNotFound)
		return nil, uuid.Nil, false
	}
	return album, workspaceID, true
}

// Create handles POST /api/v1/galleries/{galleryId}/albums
func (h *AlbumHandler) Create(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "galleryId"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery_id"}`, http.StatusBadRequest)
		return
	}
	if _, ok := h.requireGalleryInWorkspace(w, r, galleryID); !ok {
		return
	}

	var input struct {
		Name        string  `json:"name"`
		Description string  `json:"description"`
		ParentID    *string `json:"parent_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	createInput := service.CreateAlbumInput{
		GalleryID:   galleryID,
		Name:        input.Name,
		Description: input.Description,
	}
	if input.ParentID != nil {
		pid, err := uuid.Parse(*input.ParentID)
		if err == nil {
			createInput.ParentID = &pid
		}
	}

	album, err := h.albumSvc.Create(r.Context(), createInput)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{"data": album})
}

// List handles GET /api/v1/galleries/{galleryId}/albums
func (h *AlbumHandler) List(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "galleryId"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery_id"}`, http.StatusBadRequest)
		return
	}
	if _, ok := h.requireGalleryReadable(w, r, galleryID); !ok {
		return
	}

	albums, err := h.albumSvc.ListByGallery(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// F-091: with ?include_asset_ids=true the client gets each album's membership
	// inline (one batched request) instead of one ListAssets call per album.
	// Without the flag the response is byte-for-byte the historical shape.
	if r.URL.Query().Get("include_asset_ids") == "true" {
		idsByAlbum, err := h.albumSvc.ListAssetIDsByGallery(r.Context(), galleryID)
		if err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}
		out := make([]map[string]interface{}, 0, len(albums))
		for _, al := range albums {
			b, mErr := json.Marshal(al)
			if mErr != nil {
				http.Error(w, `{"error":"encode album failed"}`, http.StatusInternalServerError)
				return
			}
			m := map[string]interface{}{}
			_ = json.Unmarshal(b, &m)
			ids := idsByAlbum[al.ID]
			if ids == nil {
				ids = []uuid.UUID{}
			}
			m["asset_ids"] = ids
			out = append(out, m)
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"data": out})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"data": albums})
}

// GetByID handles GET /api/v1/albums/{id}
func (h *AlbumHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}

	album, _, ok := h.requireAlbumInWorkspace(w, r, id)
	if !ok {
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"data": album})
}

// Update handles PATCH /api/v1/albums/{id}
func (h *AlbumHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	if _, _, ok := h.requireAlbumInWorkspace(w, r, id); !ok {
		return
	}

	var input struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	album, err := h.albumSvc.Update(r.Context(), id, service.UpdateAlbumInput{
		Name:        input.Name,
		Description: input.Description,
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrAlbumNameRequired):
			http.Error(w, `{"error":"album name is required"}`, http.StatusBadRequest)
		case errors.Is(err, service.ErrAlbumNotEditable):
			http.Error(w, `{"error":"smart albums cannot be modified"}`, http.StatusBadRequest)
		case errors.Is(err, service.ErrAlbumNotFound):
			http.Error(w, `{"error":"album not found"}`, http.StatusNotFound)
		default:
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"data": album})
}

// Breadcrumb handles GET /api/v1/albums/{id}/breadcrumb
func (h *AlbumHandler) Breadcrumb(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	if _, _, ok := h.requireAlbumInWorkspace(w, r, id); !ok {
		return
	}

	chain, err := h.albumSvc.GetBreadcrumb(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"data": chain})
}

// ListAssets handles GET /api/v1/albums/{id}/assets.
func (h *AlbumHandler) ListAssets(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	if _, _, ok := h.requireAlbumInWorkspace(w, r, id); !ok {
		return
	}

	assets, err := h.albumSvc.ListAssets(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Q-2b: ?include_assets=true hydrates the whole album page server-side with
	// one bulk asset query and embeds each asset on its membership row, so the
	// owner gallery preview's album branch doesn't loop getAsset() per asset (an
	// N+1 that scaled with album size). Mirrors the gallery list seam (PERF-23).
	// The default response shape is unchanged for callers that don't opt in.
	if r.URL.Query().Get("include_assets") == "true" {
		enriched, eErr := h.enrichAlbumAssets(r.Context(), assets)
		if eErr != nil {
			http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"data": enriched})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"data": assets})
}

// AddAssets handles POST /api/v1/albums/{id}/assets.
func (h *AlbumHandler) AddAssets(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	_, workspaceID, ok := h.requireAlbumInWorkspace(w, r, id)
	if !ok {
		return
	}

	var input struct {
		AssetID  string   `json:"asset_id"`
		AssetIDs []string `json:"asset_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	rawIDs := input.AssetIDs
	if input.AssetID != "" {
		rawIDs = append(rawIDs, input.AssetID)
	}
	if len(rawIDs) == 0 {
		http.Error(w, `{"error":"asset_id or asset_ids required"}`, http.StatusBadRequest)
		return
	}

	added := 0
	skipped := 0
	for i, rawID := range rawIDs {
		assetID, err := uuid.Parse(rawID)
		if err != nil {
			http.Error(w, `{"error":"invalid asset id"}`, http.StatusBadRequest)
			return
		}
		if err := h.albumSvc.AddAsset(r.Context(), id, assetID, workspaceID, i); err != nil {
			// Cross-workspace / missing asset: skip-and-count rather than
			// abort the whole batch, and never link foreign data.
			if errors.Is(err, repository.ErrAssetNotInWorkspace) {
				skipped++
				continue
			}
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}
		added++
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"added": added, "skipped": skipped})
}

// Delete handles DELETE /api/v1/albums/{id}
func (h *AlbumHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	if _, _, ok := h.requireAlbumInWorkspace(w, r, id); !ok {
		return
	}

	if err := h.albumSvc.Delete(r.Context(), id); err != nil {
		switch {
		case errors.Is(err, service.ErrAlbumNotEditable):
			http.Error(w, `{"error":"smart albums cannot be modified"}`, http.StatusBadRequest)
		case errors.Is(err, service.ErrAlbumNotFound):
			http.Error(w, `{"error":"album not found"}`, http.StatusNotFound)
		default:
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
