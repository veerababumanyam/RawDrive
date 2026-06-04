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
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/database"
	"github.com/rawdrive/backend/internal/storage"
)

// ValkeyPinger is the narrow interface the health check needs from a
// Valkey/Redis client. nil means the probe is skipped.
type ValkeyPinger interface {
	Ping(ctx context.Context) error
}

// NATSPinger is the narrow interface the health check needs from the event
// broker. *events.NATSPublisher satisfies it; nil means the probe is skipped
// (the in-process stub broker reports "disabled").
type NATSPinger interface {
	Ping(ctx context.Context) error
}

// HealthHandler runs deep dependency probes.
type HealthHandler struct {
	pool   *pgxpool.Pool
	store  storage.Provider
	valkey ValkeyPinger
	nats   NATSPinger
}

// NewHealthHandler constructs a HealthHandler. store and valkey may be nil.
func NewHealthHandler(pool *pgxpool.Pool, store storage.Provider, valkey ValkeyPinger) *HealthHandler {
	return &HealthHandler{pool: pool, store: store, valkey: valkey}
}

// WithNATS attaches an optional NATS pinger so /health/deep also reports event
// broker reachability. Returns the handler for chaining. A nil pinger leaves
// the broker probe disabled.
func (h *HealthHandler) WithNATS(n NATSPinger) *HealthHandler {
	h.nats = n
	return h
}

// ComponentHealth is the per-component status payload.
type ComponentHealth struct {
	Status    string `json:"status"`
	LatencyMs int64  `json:"latency_ms"`
	Detail    string `json:"detail,omitempty"`
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

	// NATS probe — optional only when no broker is configured (the in-process
	// stub reports "disabled"). A configured-but-unreachable broker is a real
	// dependency failure for the events/jobs plane.
	if h.nats == nil {
		resp.Components["nats"] = ComponentHealth{Status: "disabled"}
	} else {
		start := time.Now()
		if err := h.nats.Ping(ctx); err != nil {
			resp.Components["nats"] = ComponentHealth{
				Status:    "unhealthy",
				LatencyMs: time.Since(start).Milliseconds(),
				Error:     err.Error(),
			}
			overall = "unhealthy"
		} else {
			resp.Components["nats"] = ComponentHealth{
				Status:    "healthy",
				LatencyMs: time.Since(start).Milliseconds(),
			}
		}
	}

	// Migrations — informational in /health/deep (the strict gate is
	// /health/ready). Reports whether the database has applied every migration
	// this binary embeds.
	resp.Components["migrations"] = h.migrationComponent(ctx)

	resp.Status = overall
	status := http.StatusOK
	if overall != "healthy" {
		status = http.StatusServiceUnavailable
	}
	respondJSON(w, status, resp)
}

// migrationComponent reports the database's migration head vs. what this binary
// embeds. status: "ready" (at head), "behind" (pending migrations), "unknown"
// (couldn't determine), or "disabled" (no pool).
func (h *HealthHandler) migrationComponent(ctx context.Context) ComponentHealth {
	if h.pool == nil {
		return ComponentHealth{Status: "disabled"}
	}
	start := time.Now()
	atHead, have, want, err := database.MigrationsAtHead(ctx, h.pool)
	latency := time.Since(start).Milliseconds()
	switch {
	case err != nil:
		return ComponentHealth{Status: "unknown", LatencyMs: latency, Error: err.Error()}
	case !atHead:
		return ComponentHealth{
			Status:    "behind",
			LatencyMs: latency,
			Detail:    fmt.Sprintf("applied %d/%d", have, want),
		}
	default:
		return ComponentHealth{
			Status:    "ready",
			LatencyMs: latency,
			Detail:    fmt.Sprintf("applied %d/%d", have, want),
		}
	}
}

// Ready handles GET /health/ready — a STRICT readiness gate for the deploy
// pipeline and load balancer. Unlike /health/deep (which reports every
// dependency's reachability), Ready returns 200 only when this node can
// correctly SERVE requests:
//
//   - the database is reachable, AND
//   - the cache (if configured) is reachable, AND
//   - the database is at the migration head this binary embeds.
//
// A node whose binary embeds migrations the database has not applied is NOT
// ready: it would query columns/tables that do not yet exist. NATS and object
// storage are intentionally NOT readiness gates — the API degrades gracefully
// when they blip (events queue, face endpoints 503), so the node should keep
// serving reads/writes. Those are verified at the infrastructure layer by the
// deploy pipeline instead.
func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp := DeepHealthResponse{
		Components: make(map[string]ComponentHealth),
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
	}
	ready := true

	// Database — mandatory.
	if h.pool == nil {
		resp.Components["database"] = ComponentHealth{Status: "unhealthy", Error: "pool not configured"}
		ready = false
	} else {
		start := time.Now()
		if err := h.pool.Ping(ctx); err != nil {
			resp.Components["database"] = ComponentHealth{Status: "unhealthy", LatencyMs: time.Since(start).Milliseconds(), Error: err.Error()}
			ready = false
		} else {
			resp.Components["database"] = ComponentHealth{Status: "healthy", LatencyMs: time.Since(start).Milliseconds()}
		}
	}

	// Cache — a readiness gate only when configured (rate limiting / sessions).
	if h.valkey == nil {
		resp.Components["valkey"] = ComponentHealth{Status: "disabled"}
	} else {
		start := time.Now()
		if err := h.valkey.Ping(ctx); err != nil {
			resp.Components["valkey"] = ComponentHealth{Status: "unhealthy", LatencyMs: time.Since(start).Milliseconds(), Error: err.Error()}
			ready = false
		} else {
			resp.Components["valkey"] = ComponentHealth{Status: "healthy", LatencyMs: time.Since(start).Milliseconds()}
		}
	}

	// Migrations at head — the gate that prevents a fresh binary from serving
	// against a not-yet-migrated database.
	mig := h.migrationComponent(ctx)
	resp.Components["migrations"] = mig
	if mig.Status != "ready" && mig.Status != "disabled" {
		ready = false
	}

	resp.Status = "ready"
	status := http.StatusOK
	if !ready {
		resp.Status = "not_ready"
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
