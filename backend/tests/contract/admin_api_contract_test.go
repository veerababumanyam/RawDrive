package contract_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// adminClaims returns JWT claims for a super_admin user.
func adminClaims() map[string]interface{} {
	return map[string]interface{}{
		"sub":           "admin-001",
		"role":          "Owner",
		"platform_role": "super_admin",
	}
}

func setupContractRouter() *chi.Mux {
	r := chi.NewRouter()
	r.Route("/api/v1/admin", func(r chi.Router) {
		r.Use(middleware.RequireAuth)
		r.Use(middleware.RequirePlatformRole("super_admin", "admin"))

		r.Get("/users", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"data":[{"id":"u1","email":"a@b.com","full_name":"Alice","platform_role":"photographer","status":"active","workspace_count":1,"created_at":"2026-01-01T00:00:00Z"}],"total":1}`))
		})
		r.Get("/moderation", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"data":[{"id":"m1","content_type":"gallery","content_id":"g1","workspace_id":"ws1","reason":"reported","status":"pending","created_at":"2026-04-01T00:00:00Z"}],"total":1}`))
		})
		r.Get("/revenue", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"mrr_paisa":100000,"arr_paisa":1200000,"churn_rate":1.5,"total_subscribers":50,"state_breakdown":[]}`))
		})
		r.Get("/analytics/engagement", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"dau":100,"wau":500,"mau":2000,"uploads_today":50,"galleries_created":10,"avg_session_minutes":12.0}`))
		})
		r.Get("/system/metrics", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"api_latency_p50_ms":10,"api_latency_p95_ms":30,"api_latency_p99_ms":80,"error_rate_pct":0.1,"queue_depth":5,"storage_used_bytes":1000000,"cpu_usage_pct":25,"memory_usage_pct":50,"disk_usage_pct":40,"uptime_seconds":86400}`))
		})
		r.Get("/audit-logs", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"data":[{"id":"l1","actor_id":"u1","action":"user.suspended","resource_type":"user","severity":"high","inserted_at":"2026-04-08T10:00:00Z"}],"total":1}`))
		})
	})
	return r
}

func adminRequest(r *chi.Mux, path string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	ctx := middleware.WithJWTClaims(req.Context(), adminClaims())
	req = req.WithContext(ctx)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	return rr
}

func TestContract_UsersEndpoint(t *testing.T) {
	r := setupContractRouter()
	rr := adminRequest(r, "/api/v1/admin/users")
	require.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))

	var body struct {
		Data []struct {
			ID             string `json:"id"`
			Email          string `json:"email"`
			FullName       string `json:"full_name"`
			PlatformRole   string `json:"platform_role"`
			Status         string `json:"status"`
			WorkspaceCount int    `json:"workspace_count"`
			CreatedAt      string `json:"created_at"`
		} `json:"data"`
		Total int `json:"total"`
	}
	err := json.NewDecoder(rr.Body).Decode(&body)
	require.NoError(t, err)
	assert.Equal(t, 1, body.Total)
	assert.Equal(t, "u1", body.Data[0].ID)
	assert.NotEmpty(t, body.Data[0].Email)
	assert.NotEmpty(t, body.Data[0].FullName)
	assert.NotEmpty(t, body.Data[0].Status)
	assert.NotEmpty(t, body.Data[0].CreatedAt)
}

func TestContract_ModerationEndpoint(t *testing.T) {
	r := setupContractRouter()
	rr := adminRequest(r, "/api/v1/admin/moderation")
	require.Equal(t, http.StatusOK, rr.Code)

	var body struct {
		Data []struct {
			ID          string `json:"id"`
			ContentType string `json:"content_type"`
			ContentID   string `json:"content_id"`
			WorkspaceID string `json:"workspace_id"`
			Reason      string `json:"reason"`
			Status      string `json:"status"`
			CreatedAt   string `json:"created_at"`
		} `json:"data"`
		Total int `json:"total"`
	}
	err := json.NewDecoder(rr.Body).Decode(&body)
	require.NoError(t, err)
	assert.Equal(t, 1, body.Total)
	assert.NotEmpty(t, body.Data[0].ContentType)
	assert.NotEmpty(t, body.Data[0].Reason)
}

func TestContract_RevenueEndpoint(t *testing.T) {
	r := setupContractRouter()
	rr := adminRequest(r, "/api/v1/admin/revenue")
	require.Equal(t, http.StatusOK, rr.Code)

	var body struct {
		MRR            int     `json:"mrr_paisa"`
		ARR            int     `json:"arr_paisa"`
		ChurnRate      float64 `json:"churn_rate"`
		TotalSubs      int     `json:"total_subscribers"`
		StateBreakdown []struct {
			StateName  string `json:"state_name"`
			Revenue    int    `json:"revenue_paisa"`
			Subscribers int   `json:"subscriber_count"`
		} `json:"state_breakdown"`
	}
	err := json.NewDecoder(rr.Body).Decode(&body)
	require.NoError(t, err)
	assert.Greater(t, body.MRR, 0)
	assert.Greater(t, body.ARR, 0)
}

func TestContract_EngagementEndpoint(t *testing.T) {
	r := setupContractRouter()
	rr := adminRequest(r, "/api/v1/admin/analytics/engagement")
	require.Equal(t, http.StatusOK, rr.Code)

	var body struct {
		DAU             int     `json:"dau"`
		WAU             int     `json:"wau"`
		MAU             int     `json:"mau"`
		UploadsToday    int     `json:"uploads_today"`
		GalleriesCreated int    `json:"galleries_created"`
		AvgSession      float64 `json:"avg_session_minutes"`
	}
	err := json.NewDecoder(rr.Body).Decode(&body)
	require.NoError(t, err)
	assert.Greater(t, body.DAU, 0)
	assert.Greater(t, body.MAU, 0)
}

func TestContract_SystemMetricsEndpoint(t *testing.T) {
	r := setupContractRouter()
	rr := adminRequest(r, "/api/v1/admin/system/metrics")
	require.Equal(t, http.StatusOK, rr.Code)

	var body struct {
		P50        int     `json:"api_latency_p50_ms"`
		P95        int     `json:"api_latency_p95_ms"`
		P99        int     `json:"api_latency_p99_ms"`
		ErrorRate  float64 `json:"error_rate_pct"`
		QueueDepth int     `json:"queue_depth"`
		Storage    int64   `json:"storage_used_bytes"`
		CPU        float64 `json:"cpu_usage_pct"`
		Memory     float64 `json:"memory_usage_pct"`
		Disk       float64 `json:"disk_usage_pct"`
		Uptime     int64   `json:"uptime_seconds"`
	}
	err := json.NewDecoder(rr.Body).Decode(&body)
	require.NoError(t, err)
	assert.Greater(t, body.P50, 0)
	assert.Greater(t, body.Uptime, int64(0))
}

func TestContract_AuditLogsEndpoint(t *testing.T) {
	r := setupContractRouter()
	rr := adminRequest(r, "/api/v1/admin/audit-logs")
	require.Equal(t, http.StatusOK, rr.Code)

	var body struct {
		Data []struct {
			ID           string `json:"id"`
			ActorID      string `json:"actor_id"`
			Action       string `json:"action"`
			ResourceType string `json:"resource_type"`
			Severity     string `json:"severity"`
			InsertedAt   string `json:"inserted_at"`
		} `json:"data"`
		Total int `json:"total"`
	}
	err := json.NewDecoder(rr.Body).Decode(&body)
	require.NoError(t, err)
	assert.Equal(t, 1, body.Total)
	assert.NotEmpty(t, body.Data[0].Action)
	assert.NotEmpty(t, body.Data[0].Severity)
}

func TestContract_ContentTypeHeader(t *testing.T) {
	r := setupContractRouter()
	endpoints := []string{
		"/api/v1/admin/users",
		"/api/v1/admin/moderation",
		"/api/v1/admin/revenue",
		"/api/v1/admin/system/metrics",
		"/api/v1/admin/audit-logs",
	}
	for _, ep := range endpoints {
		t.Run(ep, func(t *testing.T) {
			rr := adminRequest(r, ep)
			assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))
		})
	}
}
