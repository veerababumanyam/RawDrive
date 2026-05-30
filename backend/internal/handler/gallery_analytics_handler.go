package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/service"
)

// GalleryAnalyticsHandler handles gallery analytics HTTP requests.
type GalleryAnalyticsHandler struct {
	analyticsSvc *service.GalleryAnalyticsService
}

// NewGalleryAnalyticsHandler creates a new GalleryAnalyticsHandler.
func NewGalleryAnalyticsHandler(svc *service.GalleryAnalyticsService) *GalleryAnalyticsHandler {
	return &GalleryAnalyticsHandler{analyticsSvc: svc}
}

// Bounds for analytics query parameters. Without an upper cap an
// authenticated user could request very large ?limit/?days windows and
// amplify DB scan/sort work (F-054). Mirrors the admin_users.go cap pattern.
const (
	analyticsDefaultLimit = 10
	analyticsMaxLimit     = 100
	analyticsDefaultDays  = 30
	analyticsMaxDays      = 365
)

// clampLimit normalizes a ?limit value: non-positive falls back to the
// default, anything above the cap is clamped to the cap.
func clampLimit(limit int) int {
	if limit <= 0 {
		return analyticsDefaultLimit
	}
	if limit > analyticsMaxLimit {
		return analyticsMaxLimit
	}
	return limit
}

// clampDays normalizes a ?days value: non-positive falls back to the
// default window, anything above the cap is clamped to the cap.
func clampDays(days int) int {
	if days <= 0 {
		return analyticsDefaultDays
	}
	if days > analyticsMaxDays {
		return analyticsMaxDays
	}
	return days
}

// GetSummary handles GET /galleries/{id}/analytics/summary
func (h *GalleryAnalyticsHandler) GetSummary(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	days = clampDays(days)

	summary, err := h.analyticsSvc.GetSummary(r.Context(), galleryID, days)
	if err != nil {
		http.Error(w, `{"error":"analytics failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, summary)
}

// GetDailyStats handles GET /galleries/{id}/analytics/daily
func (h *GalleryAnalyticsHandler) GetDailyStats(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_gallery_id", "invalid gallery id")
		return
	}

	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	days = clampDays(days)

	stats, err := h.analyticsSvc.GetDailyStats(r.Context(), galleryID, days)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "analytics_failed", err.Error())
		return
	}

	respondJSON(w, http.StatusOK, stats)
}

// GetDeviceBreakdown handles GET /galleries/{id}/analytics/devices — GAL-FR-185
func (h *GalleryAnalyticsHandler) GetDeviceBreakdown(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_gallery_id", "invalid gallery id")
		return
	}
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	days = clampDays(days)
	points, err := h.analyticsSvc.DeviceBreakdown(r.Context(), galleryID, days)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "analytics_failed", err.Error())
		return
	}
	respondJSON(w, http.StatusOK, points)
}

// GetDownloadVelocity handles GET /galleries/{id}/analytics/download-velocity — GAL-FR-186
func (h *GalleryAnalyticsHandler) GetDownloadVelocity(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_gallery_id", "invalid gallery id")
		return
	}
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	days = clampDays(days)
	points, err := h.analyticsSvc.DownloadVelocity(r.Context(), galleryID, days)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "analytics_failed", err.Error())
		return
	}
	respondJSON(w, http.StatusOK, points)
}

// GetShareChannels handles GET /galleries/{id}/analytics/share-channels — GAL-FR-187
func (h *GalleryAnalyticsHandler) GetShareChannels(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_gallery_id", "invalid gallery id")
		return
	}
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	days = clampDays(days)
	points, err := h.analyticsSvc.ShareChannelBreakdown(r.Context(), galleryID, days)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "analytics_failed", err.Error())
		return
	}
	respondJSON(w, http.StatusOK, points)
}

// GetTopViews handles GET /galleries/{id}/analytics/top-views.
func (h *GalleryAnalyticsHandler) GetTopViews(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_gallery_id", "invalid gallery id")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	limit = clampLimit(limit)
	points, err := h.analyticsSvc.TopViewed(r.Context(), galleryID, limit)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "analytics_failed", err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"data": points})
}

// GetTopDownloads handles GET /galleries/{id}/analytics/top-downloads.
func (h *GalleryAnalyticsHandler) GetTopDownloads(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_gallery_id", "invalid gallery id")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	limit = clampLimit(limit)
	points, err := h.analyticsSvc.TopDownloaded(r.Context(), galleryID, limit)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "analytics_failed", err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"data": points})
}
