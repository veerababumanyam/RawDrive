package handler

import (
	"encoding/json"
	"net/http"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"

	"github.com/google/uuid"
)

// StorageAnalyticsHandler serves real-time storage usage data.
type StorageAnalyticsHandler struct {
	storageSvc *service.StorageAccounting
}

// NewStorageAnalyticsHandler creates a new handler.
func NewStorageAnalyticsHandler(svc *service.StorageAccounting) *StorageAnalyticsHandler {
	return &StorageAnalyticsHandler{storageSvc: svc}
}

// GetAnalytics handles GET /api/v1/storage/analytics
// Returns real storage usage, per-gallery breakdown, and per-type distribution.
func (h *StorageAnalyticsHandler) GetAnalytics(w http.ResponseWriter, r *http.Request) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	wsIDStr, _ := claims["workspace_id"].(string)
	wsID, err := uuid.Parse(wsIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid workspace"}`, http.StatusBadRequest)
		return
	}

	analytics, err := h.storageSvc.GetAnalytics(r.Context(), wsID)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch storage analytics"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": analytics,
	})
}

// GetUsage handles GET /api/v1/storage/usage
// Returns just the workspace storage usage (lighter endpoint for sidebar widget).
func (h *StorageAnalyticsHandler) GetUsage(w http.ResponseWriter, r *http.Request) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	wsIDStr, _ := claims["workspace_id"].(string)
	wsID, err := uuid.Parse(wsIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid workspace"}`, http.StatusBadRequest)
		return
	}

	usage, err := h.storageSvc.GetUsage(r.Context(), wsID)
	if err != nil {
		// Return zeros if no workspace_storage row yet
		usage = &service.WorkspaceStorage{WorkspaceID: wsID}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": map[string]interface{}{
			"used_bytes":       usage.UsedBytes,
			"derivative_bytes": usage.DerivativeBytes,
			"total_bytes":      usage.TotalBytes,
			"quota_bytes":      usage.QuotaBytes,
			"percent_used":     usage.PercentUsed,
			"warning_level":    usage.WarningLevel(),
		},
	})
}
