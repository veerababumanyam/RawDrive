package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/streaming/shortlink"
)

// PublicResolver abstracts the shortlink service lookup/record surface
// needed by the public JSON resolver. Migrated in M35/35-5 to ResolveDetailed
// so the handler can distinguish 410 (revoked) from 404 (not found) without
// overloading a single bool.
type PublicResolver interface {
	ResolveDetailed(ctx context.Context, code string) (shortlink.ResolveResult, error)
	RecordHit(ctx context.Context, code, src, ip, userAgent string) error
}

// PublicStreamMeta is the whitelisted public metadata returned to anonymous
// callers. It deliberately OMITS playback_url, ingest_key, workspace_id,
// cf_rtmps_*, and any other internal fields.
type PublicStreamMeta struct {
	Title            string `json:"stream_title"`
	Status           string `json:"status,omitempty"`
	ScheduledStartAt string `json:"scheduled_start_at,omitempty"`
	AccessPolicy     string `json:"access_policy,omitempty"`
	Protected        bool   `json:"protected"`
}

// StreamMetaLoader loads PublicStreamMeta for a stream id.
type StreamMetaLoader interface {
	LoadPublicMeta(ctx context.Context, streamID uuid.UUID) (PublicStreamMeta, error)
}

// allowedSrc whitelists the attribution src values that match the
// streaming_shortlink_hits.src CHECK constraint.
var allowedSrc = map[string]bool{
	"qr": true, "wa": true, "email": true, "invite": true, "direct": true,
}

// normalizeSrc coerces unknown values to "direct" so we never violate the
// CHECK constraint or leak unsanitised input into the hits table.
func normalizeSrc(in string) string {
	s := strings.ToLower(strings.TrimSpace(in))
	if allowedSrc[s] {
		return s
	}
	return "direct"
}

// PublicShortlinkHandler serves GET /api/v1/public/s/{code}. Mounted with NO
// auth middleware. Returns whitelisted JSON metadata, records attribution,
// and rate-limits aggressive callers.
type PublicShortlinkHandler struct {
	res      PublicResolver
	meta     StreamMetaLoader
	rlPerMin int

	mu      sync.Mutex
	buckets map[string][]time.Time
}

// NewPublicShortlinkHandler wires the resolver with a per-IP rate bucket.
// rlPerMin defaults to 60 when <=0.
func NewPublicShortlinkHandler(res PublicResolver, meta StreamMetaLoader, rlPerMin int) *PublicShortlinkHandler {
	if rlPerMin <= 0 {
		rlPerMin = 60
	}
	return &PublicShortlinkHandler{
		res:      res,
		meta:     meta,
		rlPerMin: rlPerMin,
		buckets:  map[string][]time.Time{},
	}
}

func publicClientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		if i := strings.Index(fwd, ","); i >= 0 {
			return strings.TrimSpace(fwd[:i])
		}
		return strings.TrimSpace(fwd)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (h *PublicShortlinkHandler) allow(ip string) bool {
	now := time.Now()
	cutoff := now.Add(-time.Minute)
	h.mu.Lock()
	defer h.mu.Unlock()
	b := h.buckets[ip]
	trimmed := b[:0]
	for _, t := range b {
		if t.After(cutoff) {
			trimmed = append(trimmed, t)
		}
	}
	if len(trimmed) >= h.rlPerMin {
		h.buckets[ip] = trimmed
		return false
	}
	h.buckets[ip] = append(trimmed, now)
	return true
}

// Resolve serves GET /public/s/{code}.
func (h *PublicShortlinkHandler) Resolve(w http.ResponseWriter, r *http.Request) {
	ip := publicClientIP(r)
	if !h.allow(ip) {
		w.Header().Set("Retry-After", "60")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":"rate_limited"}`))
		return
	}

	code := chi.URLParam(r, "code")
	if code == "" {
		// Fallback when mounted outside chi.
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		code = parts[len(parts)-1]
	}

	result, err := h.res.ResolveDetailed(r.Context(), code)
	if err != nil {
		if errors.Is(err, shortlink.ErrNotFound) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"error":"not_found"}`))
			return
		}
		if errors.Is(err, shortlink.ErrRevoked) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusGone)
			_, _ = w.Write([]byte(`{"error":"revoked"}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"internal"}`))
		return
	}
	if result.RevokedAt != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusGone)
		_, _ = w.Write([]byte(`{"error":"revoked"}`))
		return
	}
	streamID := result.StreamID

	src := normalizeSrc(r.URL.Query().Get("src"))
	// Record the impression best-effort — never block the response.
	_ = h.res.RecordHit(r.Context(), code, src, ip, r.UserAgent())

	var meta PublicStreamMeta
	if h.meta != nil {
		m, merr := h.meta.LoadPublicMeta(r.Context(), streamID)
		if merr == nil {
			meta = m
		}
	}

	// Whitelisted response: flatten meta fields and add stream_id + src.
	// Intentionally does NOT include playback_url, ingest_key, workspace_id,
	// or any cf_rtmps_* values — see the 35-5 security invariants.
	payload := map[string]interface{}{
		"stream_id":          streamID.String(),
		"src":                src,
		"stream_title":       meta.Title,
		"protected":          meta.Protected,
		"status":             meta.Status,
		"scheduled_start_at": meta.ScheduledStartAt,
		"access_policy":      meta.AccessPolicy,
	}
	// Drop empty omitempty-style fields to preserve the M34 response shape.
	for _, k := range []string{"status", "scheduled_start_at", "access_policy"} {
		if payload[k] == "" {
			delete(payload, k)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(payload)
}
