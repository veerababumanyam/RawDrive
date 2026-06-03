package handler

import (
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/service"
)

// analyticsErrMsg is the static, schema-safe message returned to clients on
// any analytics 5xx. Raw service/DB errors are logged server-side only — they
// can contain Postgres table/column/constraint names and must never reach an
// (authenticated) caller. Mirrors the GetSummary path in this file (F-099).
const analyticsErrMsg = "analytics failed"

// GalleryAnalyticsHandler handles gallery analytics HTTP requests.
type GalleryAnalyticsHandler struct {
	analyticsSvc *service.GalleryAnalyticsService
	// galleryResolver enforces tenant ownership on gallery-scoped routes via
	// guardGalleryWorkspace. Nil-safe: when unwired the guard fails closed.
	galleryResolver *service.GalleryService
}

// NewGalleryAnalyticsHandler creates a new GalleryAnalyticsHandler.
func NewGalleryAnalyticsHandler(svc *service.GalleryAnalyticsService) *GalleryAnalyticsHandler {
	return &GalleryAnalyticsHandler{analyticsSvc: svc}
}

// WithGalleryResolver injects the gallery resolver used by guardGalleryWorkspace
// to enforce tenant ownership before serving gallery-scoped routes. Chainable;
// tolerates a nil resolver (the guard fails closed when the resolver is nil).
func (h *GalleryAnalyticsHandler) WithGalleryResolver(gs *service.GalleryService) *GalleryAnalyticsHandler {
	h.galleryResolver = gs
	return h
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

	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID); !ok {
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

	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID); !ok {
		return
	}

	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	days = clampDays(days)

	stats, err := h.analyticsSvc.GetDailyStats(r.Context(), galleryID, days)
	if err != nil {
		log.Printf("gallery analytics GetDailyStats failed (gallery=%s): %v", galleryID, err)
		respondError(w, http.StatusInternalServerError, "analytics_failed", analyticsErrMsg)
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
	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID); !ok {
		return
	}
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	days = clampDays(days)
	points, err := h.analyticsSvc.DeviceBreakdown(r.Context(), galleryID, days)
	if err != nil {
		log.Printf("gallery analytics DeviceBreakdown failed (gallery=%s): %v", galleryID, err)
		respondError(w, http.StatusInternalServerError, "analytics_failed", analyticsErrMsg)
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
	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID); !ok {
		return
	}
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	days = clampDays(days)
	points, err := h.analyticsSvc.DownloadVelocity(r.Context(), galleryID, days)
	if err != nil {
		log.Printf("gallery analytics DownloadVelocity failed (gallery=%s): %v", galleryID, err)
		respondError(w, http.StatusInternalServerError, "analytics_failed", analyticsErrMsg)
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
	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID); !ok {
		return
	}
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	days = clampDays(days)
	points, err := h.analyticsSvc.ShareChannelBreakdown(r.Context(), galleryID, days)
	if err != nil {
		log.Printf("gallery analytics ShareChannelBreakdown failed (gallery=%s): %v", galleryID, err)
		respondError(w, http.StatusInternalServerError, "analytics_failed", analyticsErrMsg)
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
	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID); !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	limit = clampLimit(limit)
	points, err := h.analyticsSvc.TopViewed(r.Context(), galleryID, limit)
	if err != nil {
		log.Printf("gallery analytics TopViewed failed (gallery=%s): %v", galleryID, err)
		respondError(w, http.StatusInternalServerError, "analytics_failed", analyticsErrMsg)
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
	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID); !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	limit = clampLimit(limit)
	points, err := h.analyticsSvc.TopDownloaded(r.Context(), galleryID, limit)
	if err != nil {
		log.Printf("gallery analytics TopDownloaded failed (gallery=%s): %v", galleryID, err)
		respondError(w, http.StatusInternalServerError, "analytics_failed", analyticsErrMsg)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"data": points})
}
