package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/service"
)

// GalleryAccessHandler handles gallery access control HTTP requests.
type GalleryAccessHandler struct {
	accessSvc *service.GalleryAccessService
}

// NewGalleryAccessHandler creates a new GalleryAccessHandler.
func NewGalleryAccessHandler(svc *service.GalleryAccessService) *GalleryAccessHandler {
	return &GalleryAccessHandler{accessSvc: svc}
}

// VerifyPassword handles POST /public/galleries/{slug}/verify-password
func (h *GalleryAccessHandler) VerifyPassword(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	// Resolve gallery ID from slug — this would use the gallery repo
	// For now, we parse the slug as a potential gallery ID for direct access
	galleryID, err := resolveGalleryFromSlug(slug)
	if err != nil {
		http.Error(w, `{"error":"invalid password"}`, http.StatusUnauthorized)
		return
	}

	token, err := h.accessSvc.VerifyPassword(r.Context(), galleryID, input.Password)
	if err != nil {
		// Generic error to avoid gallery existence leak (GAL-FR-104)
		http.Error(w, `{"error":"invalid password"}`, http.StatusUnauthorized)
		return
	}

	// Set session cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "gallery_session",
		Value:    token,
		Path:     "/g/" + slug,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   true,
		MaxAge:   86400, // 24 hours
	})

	respondJSON(w, http.StatusOK, map[string]string{"token": token})
}

// SetPassword handles POST /galleries/{id}/password
func (h *GalleryAccessHandler) SetPassword(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	if err := h.accessSvc.SetPassword(r.Context(), galleryID, input.Password); err != nil {
		http.Error(w, `{"error":"failed to set password"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// SetAccessMode handles PATCH /galleries/{id}/access-mode
func (h *GalleryAccessHandler) SetAccessMode(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		AccessMode string `json:"access_mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	if err := h.accessSvc.SetAccessMode(r.Context(), galleryID, input.AccessMode); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// ViewAsClient handles POST /galleries/{id}/view-as-client
func (h *GalleryAccessHandler) ViewAsClient(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	token, err := h.accessSvc.CreateViewAsClientToken(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"failed to create client view token"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"token": token})
}

// GetAccessLogs handles GET /galleries/{id}/access-logs
func (h *GalleryAccessHandler) GetAccessLogs(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 {
		limit = 50
	}

	logs, total, err := h.accessSvc.GetAccessLogs(r.Context(), galleryID, limit, offset)
	if err != nil {
		http.Error(w, `{"error":"failed to get access logs"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"logs":  logs,
		"total": total,
	})
}

// SetProofingDeadline handles PATCH /galleries/{id}/proofing/deadline
func (h *GalleryAccessHandler) SetProofingDeadline(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		Deadline string `json:"deadline"` // ISO 8601 format
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	// Parse deadline — handled by the service layer validation
	deadline, err := parseISO8601(input.Deadline)
	if err != nil {
		http.Error(w, `{"error":"invalid deadline format (use ISO 8601)"}`, http.StatusBadRequest)
		return
	}

	if err := h.accessSvc.SetProofingDeadline(r.Context(), galleryID, deadline); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// resolveGalleryFromSlug attempts to parse a slug as a UUID (simple implementation).
// In production, this would lookup the gallery by slug from the repository.
func resolveGalleryFromSlug(slug string) (uuid.UUID, error) {
	return uuid.Parse(slug)
}

func parseISO8601(s string) (time.Time, error) {
	return time.Parse(time.RFC3339, s)
}
