package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/service"
)

// GalleryFavoritesHandler exposes the 4 endpoints for guest favorites:
//
//   POST   /api/v1/public/galleries/{slug}/favorites/{assetId}  — heart a photo
//   DELETE /api/v1/public/galleries/{slug}/favorites/{assetId}  — unheart
//   GET    /api/v1/public/galleries/{slug}/favorites            — list this session's hearts
//   GET    /api/v1/galleries/{id}/favorites                     — owner aggregation
//
// The public 3 are anonymous — keyed on a guest_session_id sent by the
// browser (UUID minted client-side, stored in localStorage). The owner
// endpoint runs inside the JWT middleware group so route mounting is
// what enforces ownership, not handler-level auth checks.
type GalleryFavoritesHandler struct {
	svc *service.GalleryFavoritesService
}

func NewGalleryFavoritesHandler(svc *service.GalleryFavoritesService) *GalleryFavoritesHandler {
	return &GalleryFavoritesHandler{svc: svc}
}

// ───────────────────────── Public endpoints ─────────────────────────

// Add handles POST /api/v1/public/galleries/{slug}/favorites/{assetId}.
// Body: {"guest_session_id": "<opaque-uuid>"}.
// Idempotent — re-favoriting the same asset returns 201 without creating
// a duplicate row.
func (h *GalleryFavoritesHandler) Add(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	assetIDStr := chi.URLParam(r, "assetId")

	assetID, err := uuid.Parse(assetIDStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid asset id"})
		return
	}

	var body struct {
		GuestSessionID string `json:"guest_session_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	if err := h.svc.AddFavoriteBySlug(r.Context(), slug, assetID, body.GuestSessionID); err != nil {
		h.writeServiceError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, map[string]string{"status": "favorited"})
}

// Remove handles DELETE /api/v1/public/galleries/{slug}/favorites/{assetId}
// ?session=<opaque-uuid>. Idempotent — removing a non-existent favorite
// returns 204.
func (h *GalleryFavoritesHandler) Remove(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	assetIDStr := chi.URLParam(r, "assetId")
	sessionID := r.URL.Query().Get("session")

	assetID, err := uuid.Parse(assetIDStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid asset id"})
		return
	}

	if err := h.svc.RemoveFavoriteBySlug(r.Context(), slug, assetID, sessionID); err != nil {
		h.writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ListForSession handles GET /api/v1/public/galleries/{slug}/favorites
// ?session=<opaque-uuid>. Returns the asset IDs this guest has favorited
// so the frontend can hydrate Star button state on page load.
//
// Returns {"asset_ids": []} (never null) when the session has no
// favorites, so frontend mapping doesn't need a null-check.
func (h *GalleryFavoritesHandler) ListForSession(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	sessionID := r.URL.Query().Get("session")

	ids, err := h.svc.ListSessionBySlug(r.Context(), slug, sessionID)
	if err != nil {
		h.writeServiceError(w, err)
		return
	}

	// Convert []uuid.UUID → []string so the JSON wire format is the
	// shape the frontend expects (matches PublicAsset.id encoding).
	out := make([]string, len(ids))
	for i, id := range ids {
		out[i] = id.String()
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"asset_ids": out,
	})
}

// ───────────────────────── Owner endpoint ─────────────────────────

// Summarize handles GET /api/v1/galleries/{id}/favorites. Returns the
// aggregated breakdown used by the dashboard "Favorites" tile.
// Auth is enforced by the route mount point (inside the JWT group), not
// re-checked here.
func (h *GalleryFavoritesHandler) Summarize(w http.ResponseWriter, r *http.Request) {
	galleryIDStr := chi.URLParam(r, "id")
	galleryID, err := uuid.Parse(galleryIDStr)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid gallery id"})
		return
	}

	summary, err := h.svc.SummarizeByID(r.Context(), galleryID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "summarize failed"})
		return
	}
	respondJSON(w, http.StatusOK, summary)
}

// writeServiceError maps the sentinel service errors to HTTP statuses.
// Keeps the handler thin and the status codes consistent across all
// three public endpoints.
func (h *GalleryFavoritesHandler) writeServiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrGalleryFavoritesMissingSession):
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "guest_session_id is required"})
	case errors.Is(err, service.ErrGalleryFavoritesNotFound),
		errors.Is(err, service.ErrGalleryFavoritesNotPublished):
		// Both collapse to 404 so we don't leak the existence of
		// unpublished galleries to anonymous probes.
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "gallery not found"})
	case errors.Is(err, service.ErrGalleryFavoritesExpired):
		respondJSON(w, http.StatusGone, map[string]string{"error": "gallery expired"})
	default:
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "favorite operation failed"})
	}
}
