package handler

// banner_handler.go — M14 GAL-FR-157: gallery banner HTTP surface.
//
// Studio admin routes are mounted under the JWT-protected gallery
// group. Public gallery rendering uses ListLiveBySlug — a
// slug-addressed endpoint that resolves the gallery via the same
// adapter the cart uses.

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
)

// BannerHandler handles gallery banner HTTP requests.
type BannerHandler struct {
	svc *service.BannerService
}

// NewBannerHandler constructs a BannerHandler.
func NewBannerHandler(svc *service.BannerService) *BannerHandler {
	return &BannerHandler{svc: svc}
}

// List handles GET /galleries/{id}/banners — studio-only admin view.
func (h *BannerHandler) List(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_gallery_id", "invalid gallery id")
		return
	}
	banners, err := h.svc.List(r.Context(), galleryID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "banner_list_failed", err.Error())
		return
	}
	respondJSON(w, http.StatusOK, banners)
}

// Create handles POST /galleries/{id}/banners.
func (h *BannerHandler) Create(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_gallery_id", "invalid gallery id")
		return
	}
	var in service.BannerInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_json", "invalid json body")
		return
	}
	wsIDStr := middleware.WorkspaceIDFromContext(r.Context())
	wsID, _ := uuid.Parse(wsIDStr)
	banner, err := h.svc.Create(r.Context(), galleryID, wsID, in)
	if err != nil {
		respondBannerError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, banner)
}

// Update handles PUT /galleries/{id}/banners/{bannerId}.
func (h *BannerHandler) Update(w http.ResponseWriter, r *http.Request) {
	bannerID, err := uuid.Parse(chi.URLParam(r, "bannerId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_banner_id", "invalid banner id")
		return
	}
	var in service.BannerInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_json", "invalid json body")
		return
	}
	banner, err := h.svc.Update(r.Context(), bannerID, in)
	if err != nil {
		respondBannerError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, banner)
}

// Delete handles DELETE /galleries/{id}/banners/{bannerId}.
func (h *BannerHandler) Delete(w http.ResponseWriter, r *http.Request) {
	bannerID, err := uuid.Parse(chi.URLParam(r, "bannerId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_banner_id", "invalid banner id")
		return
	}
	if err := h.svc.Delete(r.Context(), bannerID); err != nil {
		respondError(w, http.StatusInternalServerError, "banner_delete_failed", err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ListLiveBySlug handles GET /public/galleries/{slug}/banners — the
// slug-addressed public endpoint returns only banners currently
// inside their active window.
func (h *BannerHandler) ListLiveBySlug(resolver GallerySlugResolver) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		if slug == "" {
			respondError(w, http.StatusBadRequest, "missing_slug", "slug required")
			return
		}
		galleryID, err := resolver.ResolveSlugToID(r.Context(), slug)
		if err != nil {
			respondError(w, http.StatusNotFound, "gallery_not_found", "gallery not found")
			return
		}
		banners, err := h.svc.ListLive(r.Context(), galleryID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "banner_list_failed", err.Error())
			return
		}
		respondJSON(w, http.StatusOK, banners)
	}
}

// respondBannerError maps service errors to HTTP responses.
func respondBannerError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrBannerNotFound):
		respondError(w, http.StatusNotFound, "banner_not_found", err.Error())
	case errors.Is(err, service.ErrBannerTitleRequired),
		errors.Is(err, service.ErrBannerInvalidWindow):
		respondError(w, http.StatusBadRequest, "banner_validation", err.Error())
	default:
		respondError(w, http.StatusInternalServerError, "banner_error", err.Error())
	}
}
