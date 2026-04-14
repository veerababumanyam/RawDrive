// Package handlers — Story 35-3 viewer-facing chat + reactions HTTP surface.
//
// ChatViewerHandler wraps chat.Service for the public viewer endpoints:
//
//	POST /api/v1/public/streams/{streamID}/chat       — submit chat text
//	POST /api/v1/public/streams/{streamID}/reactions  — submit one reaction
//
// Auth is viewer-session JWT (Bearer). The handler is server-authoritative:
// slow-mode, ban, liveness, and rate-limit gates live in chat.Service and are
// mapped here to HTTP status codes. Client-side throttling is UX only.
//
// Moderator delete still flows through live_console_handler.Moderate; the
// wiring between LiveConsoleDeps.Moderate and chat.Service.ModerateMessage is
// a separate concern (handled at app wire-up in backend/cmd/api).
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/streaming/chat"
	"github.com/rawdrive/backend/internal/streaming/repository"
	"github.com/rawdrive/backend/internal/streaming/viewer"
)

// ChatServiceAPI is the subset of chat.Service this handler uses. Declared as
// an interface to keep tests hermetic.
type ChatServiceAPI interface {
	PostViewerMessage(ctx context.Context, streamID, workspaceID, viewerSessionID uuid.UUID, body string) (*repository.ChatMessage, error)
	PostReaction(ctx context.Context, streamID, workspaceID, viewerSessionID uuid.UUID, kind string) error
}

// StreamWorkspaceResolver maps stream_id → owning workspace_id. Viewer JWTs
// deliberately do not carry workspace_id (anti-enumeration); the service-side
// lookup is the sole authority.
type StreamWorkspaceResolver interface {
	WorkspaceIDForStream(ctx context.Context, streamID uuid.UUID) (uuid.UUID, error)
}

// ChatViewerHandler exposes the two public POST endpoints.
type ChatViewerHandler struct {
	svc      ChatServiceAPI
	viewer   *viewer.Service
	resolver StreamWorkspaceResolver
	flag     LiveConsoleFeatureFlag
}

// NewChatViewerHandler wires the handler.
func NewChatViewerHandler(
	svc ChatServiceAPI,
	viewerSvc *viewer.Service,
	resolver StreamWorkspaceResolver,
	flag LiveConsoleFeatureFlag,
) *ChatViewerHandler {
	return &ChatViewerHandler{svc: svc, viewer: viewerSvc, resolver: resolver, flag: flag}
}

// resolveStreamAndAuth validates the viewer JWT, checks the feature flag, and
// parses the {streamID} URL param. Returns (streamID, viewerSessionID, workspaceID, ok).
// On ok==false the handler has already written the error response.
func (h *ChatViewerHandler) resolveStreamAndAuth(w http.ResponseWriter, r *http.Request) (uuid.UUID, uuid.UUID, uuid.UUID, bool) {
	// 1. Path param first — we need it for everything else.
	//    chi param name must match routes.go registration ("streamID").
	streamParam := chi.URLParam(r, "streamID")
	if streamParam == "" {
		streamParam = chi.URLParam(r, "id")
	}
	streamID, err := uuid.Parse(streamParam)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "not_found")
		return uuid.Nil, uuid.Nil, uuid.Nil, false
	}

	// 2. Viewer JWT parse (Bearer <token>).
	authz := r.Header.Get("Authorization")
	if !strings.HasPrefix(authz, "Bearer ") {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return uuid.Nil, uuid.Nil, uuid.Nil, false
	}
	tokenStr := strings.TrimPrefix(authz, "Bearer ")
	if h.viewer == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return uuid.Nil, uuid.Nil, uuid.Nil, false
	}
	claims, err := h.viewer.Parse(tokenStr)
	if err != nil || claims == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return uuid.Nil, uuid.Nil, uuid.Nil, false
	}

	// 3. Stream binding: the viewer session JWT MUST be bound to the path stream.
	// API-001: collapse cross-stream mismatches to 404 to match the anti-
	// enumeration response of viewer_public + sse_state. The previous 403
	// leaked the existence of the path stream to a viewer holding a token
	// for a different stream.
	if claims.StreamID != streamID.String() {
		writeJSONError(w, http.StatusNotFound, "not_found")
		return uuid.Nil, uuid.Nil, uuid.Nil, false
	}
	viewerSessionID, err := uuid.Parse(claims.ViewerSessionID)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return uuid.Nil, uuid.Nil, uuid.Nil, false
	}

	// 4. Resolve workspace (needed by service for RLS + flag gate).
	workspaceID, err := h.resolver.WorkspaceIDForStream(r.Context(), streamID)
	if err != nil {
		// Anti-enumeration: treat unknown stream as 404.
		writeJSONError(w, http.StatusNotFound, "not_found")
		return uuid.Nil, uuid.Nil, uuid.Nil, false
	}

	// 5. Feature flag — off collapses to 404.
	if h.flag != nil {
		if enabled, _ := h.flag.IsEnabled(r.Context(), workspaceID); !enabled {
			writeJSONError(w, http.StatusNotFound, "not_found")
			return uuid.Nil, uuid.Nil, uuid.Nil, false
		}
	}

	return streamID, viewerSessionID, workspaceID, true
}

// PostMessage — POST /api/v1/public/streams/{streamID}/chat
//
// Request: {"body": "text"}
// Success: 201 + the persisted ChatMessage.
// Errors:
//   - 400 invalid_body / message_empty / message_too_long
//   - 401 unauthorized (missing/invalid viewer JWT)
//   - 403 viewer_banned / stream_mismatch
//   - 409 stream_not_live
//   - 410 stream_ended
//   - 429 slow_mode + Retry-After header
func (h *ChatViewerHandler) PostMessage(w http.ResponseWriter, r *http.Request) {
	streamID, sessID, wsID, ok := h.resolveStreamAndAuth(w, r)
	if !ok {
		return
	}

	var body struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_body")
		return
	}

	msg, err := h.svc.PostViewerMessage(r.Context(), streamID, wsID, sessID, body.Body)
	if err != nil {
		writeChatServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, msg)
}

// PostReaction — POST /api/v1/public/streams/{streamID}/reactions
//
// Request: {"kind": "heart"|"thumbs_up"|"celebrate"|"laugh"}
// Success: 202 Accepted.
// Errors:
//   - 400 invalid_body / invalid_kind
//   - 401 unauthorized
//   - 403 stream_mismatch
//   - 429 reaction_rate + Retry-After header
func (h *ChatViewerHandler) PostReaction(w http.ResponseWriter, r *http.Request) {
	streamID, sessID, wsID, ok := h.resolveStreamAndAuth(w, r)
	if !ok {
		return
	}

	var body struct {
		Kind string `json:"kind"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_body")
		return
	}

	if err := h.svc.PostReaction(r.Context(), streamID, wsID, sessID, body.Kind); err != nil {
		writeChatServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusAccepted)
}

// writeChatServiceError maps chat.Service sentinels + typed errors to HTTP
// responses. The mapping is exhaustive and mirrors the story 35-3 spec.
func writeChatServiceError(w http.ResponseWriter, err error) {
	// Typed errors first — they carry Retry-After.
	var slowErr *chat.SlowModeError
	if errors.As(err, &slowErr) {
		secs := int(slowErr.RetryAfter.Seconds())
		if secs < 1 {
			secs = 1
		}
		w.Header().Set("Retry-After", strconv.Itoa(secs))
		writeJSONErrorWithRetry(w, http.StatusTooManyRequests, "slow_mode", secs)
		return
	}
	var rateErr *chat.RateLimitError
	if errors.As(err, &rateErr) {
		secs := int(rateErr.RetryAfter.Seconds())
		if secs < 1 {
			secs = 1
		}
		w.Header().Set("Retry-After", strconv.Itoa(secs))
		writeJSONErrorWithRetry(w, http.StatusTooManyRequests, "reaction_rate", secs)
		return
	}

	switch {
	case errors.Is(err, chat.ErrBanned):
		writeJSONError(w, http.StatusForbidden, "viewer_banned")
	case errors.Is(err, chat.ErrStreamNotLive):
		writeJSONError(w, http.StatusConflict, "stream_not_live")
	case errors.Is(err, chat.ErrStreamEnded):
		writeJSONError(w, http.StatusGone, "stream_ended")
	case errors.Is(err, chat.ErrMessageTooLong):
		writeJSONError(w, http.StatusBadRequest, "message_too_long")
	case errors.Is(err, chat.ErrMessageEmpty):
		writeJSONError(w, http.StatusBadRequest, "message_empty")
	case errors.Is(err, chat.ErrInvalidKind):
		writeJSONError(w, http.StatusBadRequest, "invalid_kind")
	case errors.Is(err, chat.ErrRateLimited):
		writeJSONError(w, http.StatusTooManyRequests, "rate_limited")
	default:
		writeJSONError(w, http.StatusInternalServerError, "internal_error")
	}
}

func writeJSONErrorWithRetry(w http.ResponseWriter, status int, code string, retryAfter int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error":       code,
		"retry_after": retryAfter,
	})
}
