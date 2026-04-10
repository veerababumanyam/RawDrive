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

// GetSummary handles GET /galleries/{id}/analytics/summary
func (h *GalleryAnalyticsHandler) GetSummary(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if days <= 0 {
		days = 30
	}

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
	if days <= 0 {
		days = 30
	}

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
	points, err := h.analyticsSvc.ShareChannelBreakdown(r.Context(), galleryID, days)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "analytics_failed", err.Error())
		return
	}
	respondJSON(w, http.StatusOK, points)
}
