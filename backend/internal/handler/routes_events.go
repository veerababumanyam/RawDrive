package handler

import (
	"github.com/go-chi/chi/v5"

	"github.com/rawdrive/backend/internal/auth"
)

// RegisterEventRoutes mounts the SSE event stream endpoint.
// This route handles its own JWT auth via query parameter since
// the browser EventSource API does not support custom headers.
func RegisterEventRoutes(r chi.Router, broker *EventBroker, jwtSvc auth.JWTService) {
	h := NewEventsHandler(broker, jwtSvc)
	r.Get("/events/stream", h.Stream)
}
