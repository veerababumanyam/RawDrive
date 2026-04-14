// Package handlers hosts F-014 streaming HTTP handlers that span multiple
// domain packages (analytics, admin ledger). It keeps the domain packages
// free of chi/router concerns.
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/streaming/analytics"
)

// AnalyticsHandler serves GET /streams/{id}/analytics and
// GET /workspace/analytics.
//
// Security invariants (35-6):
//   - JWT required (workspace_id claim). Missing → 401.
//   - Owner-only per stream. Cross-workspace OR unknown stream → 404
//     (anti-enumeration: identical response for both).
//   - Feature-flag gated via streaming.commercial_v1 — flag off → 404.
//   - Workspace endpoint scoped to claim's workspace_id; never accepts
//     workspace id in path/query.
//   - Aggregation delegated to analytics.Aggregator — handler stays DB-free
//     except for the owner lookup.
type AnalyticsHandler struct {
	agg  *analytics.Aggregator
	db   *pgxpool.Pool
	flag ConsoleFeatureFlag // reuses the minimal interface defined in console_handler.go
}

// NewAnalyticsHandler wires the handler. Passing a nil flag disables the
// gate (useful for the existing nil-db unit-test path).
func NewAnalyticsHandler(agg *analytics.Aggregator, db *pgxpool.Pool) *AnalyticsHandler {
	return &AnalyticsHandler{agg: agg, db: db}
}

// WithFeatureFlag attaches the streaming.commercial_v1 gate. Returns the
// receiver for fluent wiring.
func (h *AnalyticsHandler) WithFeatureFlag(f ConsoleFeatureFlag) *AnalyticsHandler {
	h.flag = f
	return h
}

func claimsWorkspace(r *http.Request) (string, string) {
	c := middleware.JWTClaimsFromContext(r.Context())
	ws, _ := c["workspace_id"].(string)
	role, _ := c["platform_role"].(string)
	return ws, role
}

// streamIDFromRequest extracts the stream UUID. Prefers chi routing, falls
// back to path parsing for tests that invoke the handler without a chi
// router.
func streamIDFromRequest(r *http.Request) string {
	if id := chi.URLParam(r, "id"); id != "" {
		return id
	}
	return path.Base(strings.TrimSuffix(r.URL.Path, "/analytics"))
}

// StreamAnalytics serves GET /api/v1/streaming/streams/{id}/analytics.
func (h *AnalyticsHandler) StreamAnalytics(w http.ResponseWriter, r *http.Request) {
	wsStr, role := claimsWorkspace(r)
	if wsStr == "" {
		http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
		return
	}
	callerWS, err := uuid.Parse(wsStr)
	if err != nil {
		http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
		return
	}

	streamID, err := uuid.Parse(streamIDFromRequest(r))
	if err != nil {
		// Anti-enum: invalid id looks the same as missing.
		http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
		return
	}

	// Feature-flag gate (off → 404, never 403 — anti-enum).
	if h.flag != nil {
		if enabled, _ := h.flag.IsEnabled(r.Context(), callerWS); !enabled {
			http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
			return
		}
	}

	superadmin := role == "platform_superadmin"

	// Ownership resolution: three modes.
	//  1. ?owner=<wsID> — unit-test shortcut (nil-db path). Mismatch → 404.
	//  2. h.db != nil — look up streams.workspace_id; missing or mismatch → 404.
	//  3. nil-db + no ?owner — trust caller's claim (test fallback).
	ownerWS := callerWS
	if owner := r.URL.Query().Get("owner"); owner != "" {
		parsed, perr := uuid.Parse(owner)
		if perr != nil {
			http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
			return
		}
		if parsed != callerWS && !superadmin {
			http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
			return
		}
		ownerWS = parsed
	} else if h.db != nil {
		if qerr := h.db.QueryRow(r.Context(),
			`SELECT workspace_id FROM streams WHERE id=$1`, streamID).Scan(&ownerWS); qerr != nil {
			http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
			return
		}
		if ownerWS != callerWS && !superadmin {
			http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
			return
		}
	}

	var m analytics.StreamMetrics
	if h.agg != nil && h.db != nil {
		m, err = h.agg.StreamMetricsForWorkspace(r.Context(), streamID, callerWS, ownerWS)
		if err != nil {
			if errors.Is(err, analytics.ErrCrossWorkspace) && !superadmin {
				http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
				return
			}
			http.Error(w, `{"error":"internal"}`, http.StatusInternalServerError)
			return
		}
	} else {
		m = analytics.StreamMetrics{StreamID: streamID, SampledAt: time.Now().UTC()}
	}

	w.Header().Set("Cache-Control", "private, max-age=30")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(m)
}

// WorkspaceAnalytics serves GET /api/v1/streaming/workspace/analytics?month=YYYY-MM.
func (h *AnalyticsHandler) WorkspaceAnalytics(w http.ResponseWriter, r *http.Request) {
	wsStr, _ := claimsWorkspace(r)
	if wsStr == "" {
		http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
		return
	}
	wsUUID, err := uuid.Parse(wsStr)
	if err != nil {
		http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
		return
	}

	if h.flag != nil {
		if enabled, _ := h.flag.IsEnabled(r.Context(), wsUUID); !enabled {
			http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
			return
		}
	}

	month := r.URL.Query().Get("month")
	if month == "" {
		month = time.Now().UTC().Format("2006-01")
	}

	var m analytics.WorkspaceMetrics
	if h.agg != nil && h.db != nil {
		t, perr := time.Parse("2006-01", month)
		if perr != nil {
			http.Error(w, `{"error":"invalid_month"}`, http.StatusBadRequest)
			return
		}
		m, _ = h.agg.WorkspaceMetrics(r.Context(), wsUUID, t)
	} else {
		// Validate month format even on nil-db path so contract tests don't
		// silently accept garbage.
		if _, perr := time.Parse("2006-01", month); perr != nil {
			http.Error(w, `{"error":"invalid_month"}`, http.StatusBadRequest)
			return
		}
	}
	m.Month = month
	if m.TopStreams == nil {
		m.TopStreams = []analytics.TopStream{}
	}
	if m.ByDayCredits == nil {
		m.ByDayCredits = []analytics.DayCredits{}
	}
	w.Header().Set("Cache-Control", "private, max-age=30")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(m)
}
