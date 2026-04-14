package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/streaming/statepusher"
	"github.com/rawdrive/backend/internal/streaming/viewer"
)

// ViewerTokenParser is the narrow slice of viewer.Service needed by the
// SSE state handler. Accepting an interface keeps the handler testable
// without standing up a real JWT signing key.
type ViewerTokenParser interface {
	Parse(tokenStr string) (*viewer.Claims, error)
}

// SSEStatePusher is the narrow slice of statepusher.StatePusher needed by
// the SSE state handler. A fake can satisfy it in tests.
type SSEStatePusher interface {
	Subscribe(ctx context.Context, streamID uuid.UUID, lastEventID string) (<-chan statepusher.StateEvent, func(), error)
}

// SSEStateFeatureFlag is the minimal workspace-less flag surface for the
// public SSE endpoint. The public route has no workspace context, so the
// flag is evaluated with uuid.Nil — the underlying featureflag.Streaming
// CommercialFlag treats Nil as "global rollout".
type SSEStateFeatureFlag interface {
	IsEnabled(ctx context.Context, workspaceID uuid.UUID) (bool, string)
}

// SSEStateHandler serves GET /api/v1/public/streams/{streamID}/state.
//
// Wire note: EventSource (the browser API) cannot set Authorization headers,
// so the viewer access JWT is accepted both via the Authorization header
// (for server-to-server probes) and via ?access_token=<jwt> query param.
// The handler validates the token against the stream id in the URL, subscribes
// to the in-process StatePusher, and forwards state events + heartbeats until
// the request context is cancelled.
type SSEStateHandler struct {
	Parser ViewerTokenParser
	Pusher SSEStatePusher
	Flag   SSEStateFeatureFlag
}

// NewSSEStateHandler constructs a handler from its dependencies.
func NewSSEStateHandler(parser ViewerTokenParser, pusher SSEStatePusher, flag SSEStateFeatureFlag) *SSEStateHandler {
	return &SSEStateHandler{Parser: parser, Pusher: pusher, Flag: flag}
}

// ServeHTTP implements http.Handler.
func (h *SSEStateHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Feature flag — public endpoint, no workspace context (uuid.Nil).
	if h.Flag != nil {
		if enabled, _ := h.Flag.IsEnabled(r.Context(), uuid.Nil); !enabled {
			writeJSONError(w, http.StatusNotFound, "not_found")
			return
		}
	}

	streamID, err := uuid.Parse(chi.URLParam(r, "streamID"))
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "not_found")
		return
	}

	token := extractViewerToken(r)
	if token == "" {
		writeJSONError(w, http.StatusUnauthorized, "invalid_viewer_session")
		return
	}
	if h.Parser == nil {
		writeJSONError(w, http.StatusUnauthorized, "invalid_viewer_session")
		return
	}
	claims, err := h.Parser.Parse(token)
	if err != nil || claims == nil {
		writeJSONError(w, http.StatusUnauthorized, "invalid_viewer_session")
		return
	}
	if !strings.EqualFold(claims.StreamID, streamID.String()) {
		writeJSONError(w, http.StatusUnauthorized, "invalid_viewer_session")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSONError(w, http.StatusInternalServerError, "streaming_unsupported")
		return
	}

	lastEventID := r.Header.Get("Last-Event-ID")
	if lastEventID == "" {
		lastEventID = r.URL.Query().Get("last_event_id")
	}

	ch, cleanup, err := h.Pusher.Subscribe(r.Context(), streamID, lastEventID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "subscribe_failed")
		return
	}
	defer cleanup()

	// SSE headers — mirror live_console_handler.ChatStream.
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	fmt.Fprintf(w, "event: connected\ndata: {}\n\n")
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case ev, ok := <-ch:
			if !ok {
				return
			}
			if err := writeSSEEvent(w, ev); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

// extractViewerToken pulls the viewer access JWT from either the
// Authorization header or the ?access_token= query param. EventSource in
// browsers cannot set headers, so the query-param fallback is required.
func extractViewerToken(r *http.Request) string {
	if auth := r.Header.Get("Authorization"); auth != "" {
		const prefix = "Bearer "
		if strings.HasPrefix(auth, prefix) {
			return strings.TrimSpace(auth[len(prefix):])
		}
	}
	return strings.TrimSpace(r.URL.Query().Get("access_token"))
}

// writeSSEEvent serialises a StateEvent into the SSE wire format.
func writeSSEEvent(w http.ResponseWriter, ev statepusher.StateEvent) error {
	kind := ev.Kind
	if kind == "" {
		kind = "state_change"
	}
	payload, err := json.Marshal(ev)
	if err != nil {
		return err
	}
	if ev.ID != "" {
		if _, err := fmt.Fprintf(w, "id: %s\n", ev.ID); err != nil {
			return err
		}
	}
	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", kind, payload); err != nil {
		return err
	}
	return nil
}
