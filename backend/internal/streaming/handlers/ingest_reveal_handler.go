// Package handlers — M34 Round 3 / story 34-4 T-30 ingest-reveal HTTP
// handler. Exposes POST /api/v1/streams/{id}/ingest/reveal. The T-30 window
// gate, audit-row write, and CF live-input fetch all live in
// services.RevealService; this handler is a thin translation layer (auth +
// feature flag + rate limit + error → HTTP code).
//
// Security invariants enforced here:
//   - feature-flag off → 404 (never 403, never 503) — no enumeration surface.
//   - unauthenticated → 401 before touching service or limiter.
//   - rate-limit (1 req / 5s per user) → 429 with Retry-After.
//   - service ErrStreamNotFound (also cross-workspace RLS misses) → 404 —
//     never 403, to block existence probes.
//   - service ErrOutsideRevealWindow / ErrStreamEnded → 403.
//   - credentials never appear in error responses; only the 200 success body
//     carries rtmp_url + stream_key.
//   - client IP comes from X-Forwarded-For (left-most hop), RemoteAddr
//     fallback. User-Agent is forwarded verbatim for the audit row.
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
)

// RevealResult is the service → handler response envelope. We deliberately
// define it in the handlers package rather than reuse services.RevealResponse
// so the handler stays decoupled and unit-testable via a tiny interface.
type RevealResult struct {
	RTMPURL   string
	StreamKey string
	ExpiresAt time.Time
}

// RevealService is the handler's dependency on the underlying reveal service.
// The real implementation wraps services.RevealService; tests provide a fake.
type RevealService interface {
	Reveal(ctx context.Context, streamID, workspaceID, userID uuid.UUID, ipAddr, userAgent string) (*RevealResult, error)
}

// FeatureFlag matches featureflag.StreamingCommercialFlag.IsEnabled.
type FeatureFlag interface {
	IsEnabled(ctx context.Context, workspaceID uuid.UUID) (bool, string)
}

// RateLimiter is a minimal allow-or-deny gate. Key scheme: "reveal:<userID>".
type RateLimiter interface {
	Allow(key string) bool
}

// Sentinel errors the RevealService is expected to return. ErrStreamNotFound
// is declared in console_handler.go (same package) and reused here — both
// handlers funnel "missing row" and "cross-workspace RLS miss" into 404 so
// existence probes cannot distinguish them.
var (
	ErrOutsideRevealWindow = errors.New("reveal: outside T-30 window")
	ErrStreamEnded         = errors.New("reveal: stream ended")
	ErrRateLimited         = errors.New("reveal: rate limited")
)

// IngestRevealHandler serves the T-30 reveal endpoint.
type IngestRevealHandler struct {
	Reveal      RevealService
	FeatureFlag FeatureFlag
	RateLimiter RateLimiter
}

// ServeHTTP implements the reveal endpoint. Route registration elsewhere
// maps POST /api/v1/streams/{id}/ingest/reveal to this handler.
func (h *IngestRevealHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeRevealError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}

	// 1. JWT claims.
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		writeRevealError(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	userID, ok := uuidFromClaim(claims, "sub")
	if !ok {
		writeRevealError(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	workspaceID, _ := uuidFromClaim(claims, "workspace_id") // may be zero; service enforces RLS

	// 2. Feature flag — off → 404 (no enumeration).
	if h.FeatureFlag != nil {
		if enabled, _ := h.FeatureFlag.IsEnabled(r.Context(), workspaceID); !enabled {
			writeRevealError(w, http.StatusNotFound, "not_found")
			return
		}
	}

	// 3. Parse path param. On failure, 404 — an unparseable id cannot identify
	//    a stream, and 404 keeps the enumeration story consistent.
	streamID, ok := parseStreamIDFromPath(r.URL.Path)
	if !ok {
		writeRevealError(w, http.StatusNotFound, "not_found")
		return
	}

	// 4. Rate limit (per user). Include user id only — service adds stream-id
	//    scoping at its own layer if needed; matching the task spec keeps the
	//    handler contract simple.
	if h.RateLimiter != nil {
		if !h.RateLimiter.Allow("reveal:" + userID.String()) {
			w.Header().Set("Retry-After", "5")
			writeRevealError(w, http.StatusTooManyRequests, "rate_limited")
			return
		}
	}

	// 5. Call the service. It performs the T-30 gate, fetches CF creds, and
	//    writes the audit row (append-only per migration 087).
	ip := extractClientIP(r)
	ua := r.Header.Get("User-Agent")
	res, err := h.Reveal.Reveal(r.Context(), streamID, workspaceID, userID, ip, ua)
	if err != nil {
		switch {
		case errors.Is(err, ErrStreamNotFound):
			writeRevealError(w, http.StatusNotFound, "not_found")
		case errors.Is(err, ErrOutsideRevealWindow):
			writeRevealError(w, http.StatusForbidden, "reveal_window_closed")
		case errors.Is(err, ErrStreamEnded):
			writeRevealError(w, http.StatusForbidden, "stream_ended")
		case errors.Is(err, ErrRateLimited):
			w.Header().Set("Retry-After", "5")
			writeRevealError(w, http.StatusTooManyRequests, "rate_limited")
		default:
			// NEVER leak stream_key here even if the error text contains it.
			writeRevealError(w, http.StatusInternalServerError, "internal_error")
		}
		return
	}
	if res == nil {
		writeRevealError(w, http.StatusInternalServerError, "internal_error")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"rtmp_url":   res.RTMPURL,
		"stream_key": res.StreamKey,
		"expires_at": res.ExpiresAt.UTC().Format(time.RFC3339),
	})
}

// ---------- helpers ----------

func writeRevealError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":"` + code + `"}`))
}

func uuidFromClaim(claims map[string]interface{}, key string) (uuid.UUID, bool) {
	s, ok := claims[key].(string)
	if !ok || s == "" {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(s)
	if err != nil {
		return uuid.Nil, false
	}
	return id, true
}

// parseStreamIDFromPath extracts the {id} segment from
// .../streams/{id}/ingest/reveal — returns ok=false on any shape mismatch or
// unparseable UUID.
func parseStreamIDFromPath(p string) (uuid.UUID, bool) {
	// Trim trailing slash to keep the split stable.
	p = strings.TrimRight(p, "/")
	parts := strings.Split(p, "/")
	// Find "streams" segment; id is the next element.
	for i, s := range parts {
		if s == "streams" && i+1 < len(parts) {
			id, err := uuid.Parse(parts[i+1])
			if err == nil {
				return id, true
			}
			return uuid.Nil, false
		}
	}
	return uuid.Nil, false
}

// extractClientIP returns the left-most non-empty X-Forwarded-For hop, or
// falls back to RemoteAddr's host portion. Returns "" on total failure.
func extractClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// Left-most is the originating client per common reverse-proxy
		// convention (Cloudflare, nginx realip).
		if i := strings.IndexByte(xff, ','); i >= 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}
