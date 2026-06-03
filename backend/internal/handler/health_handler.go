package handler

// health_handler.go — M14 GAL-FR-205: deep health check endpoint.
//
// The existing /health returns {"status":"ok"} which is enough for a
// liveness probe but doesn't verify that downstream dependencies
// (Postgres, storage, Valkey) are actually reachable. This handler
// runs a shallow check against each dependency and returns the
// per-component status plus an overall pass/fail.
//
// Contract:
//   GET /health/deep  →  200 if all components healthy
//                        503 if any configured component is degraded/down
//   Body: { "status": "healthy|degraded|unhealthy",
//           "components": {
//             "database":  {"status": "healthy", "latency_ms": 2},
//             "storage":   {"status": "healthy", "latency_ms": 15},
//             "valkey":    {"status": "disabled", "latency_ms": 0}
//           },
//           "timestamp": "..." }
//
// The storage and valkey probes are nil-safe: if the component isn't
// configured, the handler reports "disabled" and doesn't fail the
// overall status. The database probe is mandatory — if pgxpool isn't
// available, /health/deep returns 500.

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/storage"
)

// ValkeyPinger is the narrow interface the health check needs from a
// Valkey/Redis client. nil means the probe is skipped.
type ValkeyPinger interface {
	Ping(ctx context.Context) error
}

// HealthHandler runs deep dependency probes.
type HealthHandler struct {
	pool   *pgxpool.Pool
	store  storage.Provider
	valkey ValkeyPinger
}

// NewHealthHandler constructs a HealthHandler. store and valkey may be nil.
func NewHealthHandler(pool *pgxpool.Pool, store storage.Provider, valkey ValkeyPinger) *HealthHandler {
	return &HealthHandler{pool: pool, store: store, valkey: valkey}
}

// ComponentHealth is the per-component status payload.
type ComponentHealth struct {
	Status    string `json:"status"`
	LatencyMs int64  `json:"latency_ms"`
	Error     string `json:"error,omitempty"`
}

// DeepHealthResponse is the aggregate payload returned by /health/deep.
type DeepHealthResponse struct {
	Status     string                     `json:"status"`
	Components map[string]ComponentHealth `json:"components"`
	Timestamp  string                     `json:"timestamp"`
}

// Deep handles GET /health/deep.
func (h *HealthHandler) Deep(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp := DeepHealthResponse{
		Components: make(map[string]ComponentHealth),
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
	}
	overall := "healthy"

	// Database probe — mandatory.
	if h.pool == nil {
		resp.Components["database"] = ComponentHealth{Status: "unhealthy", Error: "pool not configured"}
		overall = "unhealthy"
	} else {
		start := time.Now()
		if err := h.pool.Ping(ctx); err != nil {
			resp.Components["database"] = ComponentHealth{
				Status:    "unhealthy",
				LatencyMs: time.Since(start).Milliseconds(),
				Error:     err.Error(),
			}
			overall = "unhealthy"
		} else {
			resp.Components["database"] = ComponentHealth{
				Status:    "healthy",
				LatencyMs: time.Since(start).Milliseconds(),
			}
		}
	}

	// Storage probe — optional only when no provider is configured. If a
	// provider exists, object storage is critical for uploads/downloads.
	if h.store == nil {
		resp.Components["storage"] = ComponentHealth{Status: "disabled"}
	} else {
		start := time.Now()
		// Use a no-op probe: list with an impossible prefix should be
		// cheap and surface connection errors. The storage.Provider
		// interface doesn't expose Ping, so we use a harmless Get on
		// a non-existent key and treat 404/not-found as success.
		_, err := h.store.Get(ctx, ".healthcheck/probe")
		latency := time.Since(start).Milliseconds()
		if err != nil && !isExpectedNotFound(err) {
			resp.Components["storage"] = ComponentHealth{
				Status:    "unhealthy",
				LatencyMs: latency,
				Error:     err.Error(),
			}
			overall = "unhealthy"
		} else {
			resp.Components["storage"] = ComponentHealth{
				Status:    "healthy",
				LatencyMs: latency,
			}
		}
	}

	// Valkey probe — optional only when no client is configured.
	if h.valkey == nil {
		resp.Components["valkey"] = ComponentHealth{Status: "disabled"}
	} else {
		start := time.Now()
		if err := h.valkey.Ping(ctx); err != nil {
			resp.Components["valkey"] = ComponentHealth{
				Status:    "unhealthy",
				LatencyMs: time.Since(start).Milliseconds(),
				Error:     err.Error(),
			}
			overall = "unhealthy"
		} else {
			resp.Components["valkey"] = ComponentHealth{
				Status:    "healthy",
				LatencyMs: time.Since(start).Milliseconds(),
			}
		}
	}

	resp.Status = overall
	status := http.StatusOK
	if overall != "healthy" {
		status = http.StatusServiceUnavailable
	}
	respondJSON(w, status, resp)
}

// isExpectedNotFound returns true for errors that indicate the storage
// backend is reachable but the probed key doesn't exist — that's a
// healthy response in disguise.
func isExpectedNotFound(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	// Heuristic: any "not found", "no such key", or 404-like error means
	// the request reached the backend and was properly rejected.
	for _, marker := range []string{"not found", "NoSuchKey", "404", "NotFound", "does not exist"} {
		if contains(msg, marker) {
			return true
		}
	}
	return false
}

func contains(s, substr string) bool {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
