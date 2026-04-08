package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/rawdrive/backend/internal/auth"
)

func sseError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// EventsHandler serves Server-Sent Events to authenticated clients.
type EventsHandler struct {
	broker *EventBroker
	jwtSvc auth.JWTService
}

func NewEventsHandler(broker *EventBroker, jwtSvc auth.JWTService) *EventsHandler {
	return &EventsHandler{broker: broker, jwtSvc: jwtSvc}
}

// Stream handles GET /events/stream?token={jwt}&channels=chat
// Auth is via query param because EventSource doesn't support custom headers.
func (h *EventsHandler) Stream(w http.ResponseWriter, r *http.Request) {
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		sseError(w, http.StatusUnauthorized, "missing token parameter")
		return
	}

	claims, err := h.jwtSvc.ParseAccessToken(r.Context(), tokenStr)
	if err != nil || claims == nil {
		sseError(w, http.StatusUnauthorized, "invalid token")
		return
	}
	if claims.Sub == "" {
		sseError(w, http.StatusUnauthorized, "missing subject")
		return
	}

	channelsParam := r.URL.Query().Get("channels")
	if channelsParam == "" {
		sseError(w, http.StatusBadRequest, "channels parameter required")
		return
	}
	patterns := strings.Split(channelsParam, ",")
	for i := range patterns {
		patterns[i] = strings.TrimSpace(patterns[i])
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		sseError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	events, unsubscribe := h.broker.Subscribe(patterns)
	defer unsubscribe()

	ctx := r.Context()
	heartbeat := time.NewTicker(30 * time.Second)
	defer heartbeat.Stop()

	log.Printf("SSE: user %s connected, channels=%v", claims.Sub, patterns)

	for {
		select {
		case <-ctx.Done():
			log.Printf("SSE: user %s disconnected", claims.Sub)
			return
		case evt, ok := <-events:
			if !ok {
				return
			}
			// Extract base event type: "chat.message.{id}" -> "chat.message"
			eventType := evt.Subject
			if idx := strings.LastIndex(eventType, "."); idx > 0 {
				eventType = eventType[:idx]
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventType, evt.Data)
			flusher.Flush()
		case <-heartbeat.C:
			fmt.Fprintf(w, ": heartbeat %d\n\n", time.Now().Unix())
			flusher.Flush()
		}
	}
}
