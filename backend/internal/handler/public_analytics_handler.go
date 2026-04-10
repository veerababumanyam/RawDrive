package handler

// public_analytics_handler.go — public event tracking endpoint for
// gallery analytics. Mounted at POST /api/v1/public/galleries/{slug}/events
// alongside the other public gallery routes (banners, cart, proofing).
//
// Accepts a narrow allow-list of event_type values so untrusted public
// clients cannot inject arbitrary event types. The endpoint is
// fire-and-forget — the response is 202 Accepted regardless of the
// underlying repo error, matching the existing service.TrackEvent
// semantics (dropping an analytics event must never surface as a
// client-visible failure).

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/service"
)

// PublicAnalyticsHandler handles anonymous event tracking for a public
// gallery. Slug resolution is done through the shared
// GallerySlugResolver so the handler stays decoupled from the gallery
// service implementation.
type PublicAnalyticsHandler struct {
	svc *service.GalleryAnalyticsService
}

// NewPublicAnalyticsHandler constructs a PublicAnalyticsHandler.
func NewPublicAnalyticsHandler(svc *service.GalleryAnalyticsService) *PublicAnalyticsHandler {
	return &PublicAnalyticsHandler{svc: svc}
}

// trackEventRequest is the wire shape for POST /events.
type trackEventRequest struct {
	EventType string                 `json:"event_type"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

// publicAnalyticsAllowedEvents restricts the event types a public
// client can submit. Adding a new type here is a deliberate act — the
// studio-authenticated path remains the canonical channel for anything
// sensitive.
var publicAnalyticsAllowedEvents = map[string]struct{}{
	"banner_impression": {},
	"banner_click":      {},
	"product_view":      {},
}

// TrackPublicEvent returns a handler bound to the given slug resolver.
func (h *PublicAnalyticsHandler) TrackPublicEvent(resolver GallerySlugResolver) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		if slug == "" {
			respondError(w, http.StatusBadRequest, "missing_slug", "slug required")
			return
		}

		var req trackEventRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, http.StatusBadRequest, "invalid_json", "invalid json body")
			return
		}
		eventType := strings.TrimSpace(req.EventType)
		if _, ok := publicAnalyticsAllowedEvents[eventType]; !ok {
			respondError(w, http.StatusBadRequest, "invalid_event_type", "event type not allowed")
			return
		}

		galleryID, err := resolver.ResolveSlugToID(r.Context(), slug)
		if err != nil {
			// Slug resolution failure is a genuine 404 — clients that
			// post events to a non-existent gallery deserve a real
			// error so their tracking bugs surface.
			respondError(w, http.StatusNotFound, "gallery_not_found", "gallery not found")
			return
		}

		// Service is optional — a nil service means analytics is
		// disabled at build time. We still return 202 so the client
		// doesn't treat optional telemetry as an application error.
		if h.svc != nil {
			// Metadata is accepted for forward compatibility but the
			// current service.TrackEvent signature doesn't thread it
			// through to the repo. Dropping metadata today is
			// acceptable — impression/click counts are the load-
			// bearing signal; richer banner_id filtering can be
			// added when the service surface grows.
			_ = req.Metadata
			h.svc.TrackEvent(
				r.Context(),
				galleryID,
				eventType,
				nil, // asset_id — banner events aren't asset-scoped
				clientIP(r),
				r.UserAgent(),
				"", // visitor_email — public endpoint is anonymous
				r.Referer(),
				deviceTypeFromUA(r.UserAgent()),
			)
		}

		w.WriteHeader(http.StatusAccepted)
	}
}

// clientIP returns the best-effort visitor IP for an HTTP request,
// preferring X-Forwarded-For when present (we run behind a reverse
// proxy in production).
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// XFF can be a comma-separated list; take the leftmost entry.
		if idx := strings.Index(xff, ","); idx >= 0 {
			return strings.TrimSpace(xff[:idx])
		}
		return strings.TrimSpace(xff)
	}
	return r.RemoteAddr
}

// deviceTypeFromUA does a coarse UA classification ("mobile", "tablet",
// "desktop") so the analytics rollup can break events down by device
// without a heavy UA parser dependency.
func deviceTypeFromUA(ua string) string {
	lower := strings.ToLower(ua)
	switch {
	case strings.Contains(lower, "ipad"), strings.Contains(lower, "tablet"):
		return "tablet"
	case strings.Contains(lower, "mobile"), strings.Contains(lower, "android"), strings.Contains(lower, "iphone"):
		return "mobile"
	default:
		return "desktop"
	}
}

// Compile-time assertion: the public analytics handler depends on the
// same slug resolver contract as cart and banner, keeping all public
// gallery handlers on a single seam.
var _ = func(_ GallerySlugResolver) {}
