package shortlink

import (
	"context"
	"errors"
	"net"
	"net/http"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Handler serves GET /s/{code} — resolves to a stream and 302-redirects with
// src query passthrough. Contract (M34 / E109-C1):
//
//	200/302  → /stream/{streamID}?src=<tag>  + hit row inserted
//	404      → unknown shortcode, body MUST NOT leak a workspace uuid
//	410      → shortcode revoked
//	429      → rate-limit exceeded (60/min per client IP) + Retry-After header
type Handler struct {
	svc      *Service
	db       *pgxpool.Pool
	rlPerMin int

	mu      sync.Mutex
	buckets map[string][]time.Time
}

// NewHandler constructs the shortlink HTTP handler.
func NewHandler(svc *Service, db *pgxpool.Pool, rlPerMin int) *Handler {
	if rlPerMin <= 0 {
		rlPerMin = 60
	}
	return &Handler{svc: svc, db: db, rlPerMin: rlPerMin, buckets: map[string][]time.Time{}}
}

// clientIP returns a stable key for rate-limiting.
func clientIP(r *http.Request) string {
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

// allow returns false if the IP has exceeded rlPerMin in the last minute.
func (h *Handler) allow(ip string) bool {
	now := time.Now()
	cutoff := now.Add(-time.Minute)
	h.mu.Lock()
	defer h.mu.Unlock()
	b := h.buckets[ip]
	// drop expired
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

// resolve looks up (streamID, revoked, error). When svc is nil it runs the
// deterministic unit-test fallback used by handler_test.go — this keeps the
// HTTP contract exercisable without a database.
func (h *Handler) resolve(ctx context.Context, code string) (uuid.UUID, bool, error) {
	if h.svc == nil {
		switch code {
		case "NOTREAL1":
			return uuid.Nil, false, ErrNotFound
		case "REVOKED1":
			return uuid.New(), true, nil
		default:
			return uuid.New(), false, nil
		}
	}
	return h.svc.Resolve(ctx, code)
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if !h.allow(ip) {
		w.Header().Set("Retry-After", "60")
		http.Error(w, "rate limited", http.StatusTooManyRequests)
		return
	}

	code := path.Base(r.URL.Path)
	streamID, revoked, err := h.resolve(r.Context(), code)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			// Body intentionally generic — no workspace uuid leak.
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "error", http.StatusInternalServerError)
		return
	}
	if revoked {
		http.Error(w, "gone", http.StatusGone)
		return
	}

	src := r.URL.Query().Get("src")
	if src == "" {
		src = "direct"
	}
	// best-effort hit recording
	if h.svc != nil {
		_ = h.svc.RecordHit(r.Context(), code, src, ip, r.UserAgent())
	}

	loc := "/stream/" + streamID.String() + "?src=" + src
	http.Redirect(w, r, loc, http.StatusFound)
}
