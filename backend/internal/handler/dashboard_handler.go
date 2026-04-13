package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rawdrive/backend/internal/middleware"
)

// DashboardHandler serves dashboard-level aggregate widgets.
type DashboardHandler struct {
	pool *pgxpool.Pool
}

// NewDashboardHandler creates a handler for dashboard aggregate endpoints.
func NewDashboardHandler(pool *pgxpool.Pool) *DashboardHandler {
	return &DashboardHandler{pool: pool}
}

type galleryActivityStats struct {
	Views           int64 `json:"views"`
	Downloads       int64 `json:"downloads"`
	Selections      int64 `json:"selections"`
	ActiveGalleries int64 `json:"activeGalleries"`
}

// GetGalleryActivity handles GET /api/v1/dashboard/gallery-activity?days=7.
func (h *DashboardHandler) GetGalleryActivity(w http.ResponseWriter, r *http.Request) {
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

	days := parseDashboardDays(r.URL.Query().Get("days"))
	stats, err := h.getGalleryActivityStats(r.Context(), wsID, days)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch gallery activity"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"data": stats})
}

func parseDashboardDays(raw string) int {
	days, err := strconv.Atoi(raw)
	if err != nil || days <= 0 {
		return 7
	}
	if days > 365 {
		return 365
	}
	return days
}

func (h *DashboardHandler) getGalleryActivityStats(ctx context.Context, workspaceID uuid.UUID, days int) (galleryActivityStats, error) {
	stats := galleryActivityStats{}
	if h.pool == nil {
		return stats, nil
	}

	if err := h.pool.QueryRow(
		ctx,
		`SELECT COUNT(*)
		 FROM galleries
		 WHERE workspace_id = $1
		   AND deleted_at IS NULL
		   AND status <> 'archived'`,
		workspaceID,
	).Scan(&stats.ActiveGalleries); err != nil {
		return stats, err
	}

	err := h.pool.QueryRow(
		ctx,
		`SELECT
		   COALESCE(SUM(CASE WHEN gv.event_type = 'view' THEN 1 ELSE 0 END), 0),
		   COALESCE(SUM(CASE WHEN gv.event_type = 'download' THEN 1 ELSE 0 END), 0),
		   COALESCE(SUM(CASE WHEN gv.event_type = 'selection' THEN 1 ELSE 0 END), 0)
		 FROM gallery_views gv
		 INNER JOIN galleries g ON g.id = gv.gallery_id
		 WHERE g.workspace_id = $1
		   AND g.deleted_at IS NULL
		   AND gv.created_at >= NOW() - (($2::int) * INTERVAL '1 day')`,
		workspaceID,
		days,
	).Scan(&stats.Views, &stats.Downloads, &stats.Selections)
	if err == nil {
		return stats, nil
	}

	// If the gallery_views table is not present in this environment, keep
	// the endpoint functional with zeroed event counters.
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "42P01" {
		return stats, nil
	}
	return stats, err
}
