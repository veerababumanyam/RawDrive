package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
)

// LiveStreamMeta is the shell metadata returned by the owner-scope assertion.
// Full fields (status, rate profile, start time, etc.) land in later waves.
type LiveStreamMeta struct {
	ID          uuid.UUID `json:"id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`
	Status      string    `json:"status"`
}

// LiveIngestHealth mirrors services.IngestHealth but lives in the handler
// package so the shell tests can reference it without pulling the full service.
type LiveIngestHealth struct {
	Connected    bool      `json:"connected"`
	BitrateKbps  int       `json:"bitrate_kbps"`
	FPS          float64   `json:"fps"`
	VideoCodec   string    `json:"video_codec"`
	AudioCodec   string    `json:"audio_codec"`
	LastPushedAt time.Time `json:"last_pushed_at"`
	Status       string    `json:"status"`
}

// LiveViewerMetrics is the presence snapshot returned to the console.
type LiveViewerMetrics struct {
	Current int       `json:"current"`
	Peak    int       `json:"peak"`
	Unique  int       `json:"unique"`
	AsOf    time.Time `json:"as_of"`
}

// LiveWaitingRoomSnapshot is the pre-live viewer-page mirror.
type LiveWaitingRoomSnapshot struct {
	Title       string    `json:"title"`
	ScheduledAt time.Time `json:"scheduled_at"`
	Brand       string    `json:"brand,omitempty"`
}

// LiveModerationRequest is the owner-issued moderation command. Persistence
// happens behind a mockable interface for the shell wave.
type LiveModerationRequest struct {
	StreamID        uuid.UUID `json:"-"`
	MessageID       uuid.UUID `json:"-"`
	ActorID         uuid.UUID `json:"-"`
	Action          string    `json:"action"`
	DurationSeconds int       `json:"duration_seconds,omitempty"`
	Reason          string    `json:"reason,omitempty"`
}

// ErrLiveStreamNotFound is returned by AssertOwner when the stream either does
// not exist or belongs to another workspace. Anti-enumeration: handlers always
// collapse this to 404.
var ErrLiveStreamNotFound = errors.New("live stream not found")

// LiveConsoleDeps is the aggregation façade every live-console endpoint
// depends on. Each method is mockable; full business logic lands later.
type LiveConsoleDeps interface {
	AssertOwner(ctx context.Context, streamID, workspaceID uuid.UUID) (*LiveStreamMeta, error)
	GetIngestHealth(ctx context.Context, streamID uuid.UUID) (*LiveIngestHealth, error)
	GetViewerMetrics(ctx context.Context, streamID uuid.UUID) (*LiveViewerMetrics, error)
	GetWaitingRoomSnapshot(ctx context.Context, streamID uuid.UUID) (*LiveWaitingRoomSnapshot, error)
	Moderate(ctx context.Context, req LiveModerationRequest) error
	SetSlowMode(ctx context.Context, streamID uuid.UUID, perUserSeconds int) error
	EndStream(ctx context.Context, streamID uuid.UUID, reason string, actor uuid.UUID) error
}

// LiveConsoleFeatureFlag is a minimal flag surface — matches ConsoleFeatureFlag
// but duplicated here to keep the live-console wave self-contained.
type LiveConsoleFeatureFlag interface {
	IsEnabled(ctx context.Context, workspaceID uuid.UUID) (bool, string)
}

// LiveConsoleHandler exposes all seven endpoints for story 34-6.
type LiveConsoleHandler struct {
	deps LiveConsoleDeps
	flag LiveConsoleFeatureFlag
}

// NewLiveConsoleHandler wires the handler.
func NewLiveConsoleHandler(deps LiveConsoleDeps, flag LiveConsoleFeatureFlag) *LiveConsoleHandler {
	return &LiveConsoleHandler{deps: deps, flag: flag}
}

// assertOwner centralizes the auth + feature-flag + owner-scope check used by
// every endpoint. Return (meta, true) on success; the handler has already
// written the error response when ok==false.
func (h *LiveConsoleHandler) assertOwner(w http.ResponseWriter, r *http.Request) (*LiveStreamMeta, uuid.UUID, bool) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return nil, uuid.Nil, false
	}
	wsRaw, _ := claims["workspace_id"].(string)
	userRaw, _ := claims["sub"].(string)
	workspaceID, err := uuid.Parse(wsRaw)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return nil, uuid.Nil, false
	}
	actorID, _ := uuid.Parse(userRaw)

	// Feature flag — owner-scoped rollout.
	if h.flag != nil {
		if enabled, _ := h.flag.IsEnabled(r.Context(), workspaceID); !enabled {
			writeJSONError(w, http.StatusNotFound, "not_found")
			return nil, uuid.Nil, false
		}
	}

	streamID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "not_found")
		return nil, uuid.Nil, false
	}

	meta, err := h.deps.AssertOwner(r.Context(), streamID, workspaceID)
	if err != nil {
		// Anti-enumeration: any owner-scope failure collapses to 404.
		writeJSONError(w, http.StatusNotFound, "not_found")
		return nil, uuid.Nil, false
	}
	_ = actorID
	return meta, actorID, true
}

// GetHealth → 200 IngestHealth.
func (h *LiveConsoleHandler) GetHealth(w http.ResponseWriter, r *http.Request) {
	meta, _, ok := h.assertOwner(w, r)
	if !ok {
		return
	}
	health, err := h.deps.GetIngestHealth(r.Context(), meta.ID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "ingest_health_failed")
		return
	}
	writeJSON(w, http.StatusOK, health)
}

// GetViewers → 200 ViewerMetrics.
func (h *LiveConsoleHandler) GetViewers(w http.ResponseWriter, r *http.Request) {
	meta, _, ok := h.assertOwner(w, r)
	if !ok {
		return
	}
	metrics, err := h.deps.GetViewerMetrics(r.Context(), meta.ID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "viewer_metrics_failed")
		return
	}
	writeJSON(w, http.StatusOK, metrics)
}

// ChatStream serves the owner SSE channel. Shell implementation writes the
// initial connected event and blocks until the request context is cancelled.
// Full publish/subscribe wiring lands in a later wave.
func (h *LiveConsoleHandler) ChatStream(w http.ResponseWriter, r *http.Request) {
	if _, _, ok := h.assertOwner(w, r); !ok {
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "event: connected\ndata: {}\n\n")
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	<-r.Context().Done()
}

// Moderate handles delete/timeout/ban actions against a single message.
func (h *LiveConsoleHandler) Moderate(w http.ResponseWriter, r *http.Request) {
	meta, actor, ok := h.assertOwner(w, r)
	if !ok {
		return
	}
	msgID, err := uuid.Parse(chi.URLParam(r, "msgId"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_message_id")
		return
	}
	var body struct {
		Action          string `json:"action"`
		DurationSeconds int    `json:"duration_seconds,omitempty"`
		Reason          string `json:"reason,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_body")
		return
	}
	switch body.Action {
	case "delete", "timeout", "ban":
	default:
		writeJSONError(w, http.StatusBadRequest, "invalid_action")
		return
	}
	if body.Action == "timeout" && body.DurationSeconds <= 0 {
		writeJSONError(w, http.StatusBadRequest, "missing_duration")
		return
	}
	req := LiveModerationRequest{
		StreamID:        meta.ID,
		MessageID:       msgID,
		ActorID:         actor,
		Action:          body.Action,
		DurationSeconds: body.DurationSeconds,
		Reason:          body.Reason,
	}
	if err := h.deps.Moderate(r.Context(), req); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "moderation_failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// SetSlowMode sets per-user posting interval (0 = off).
func (h *LiveConsoleHandler) SetSlowMode(w http.ResponseWriter, r *http.Request) {
	meta, _, ok := h.assertOwner(w, r)
	if !ok {
		return
	}
	var body struct {
		IntervalSeconds int `json:"interval_seconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_body")
		return
	}
	if body.IntervalSeconds < 0 {
		writeJSONError(w, http.StatusBadRequest, "invalid_interval")
		return
	}
	if err := h.deps.SetSlowMode(r.Context(), meta.ID, body.IntervalSeconds); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "slow_mode_failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"interval_seconds": body.IntervalSeconds})
}

// GetWaitingRoom → 200 WaitingRoomSnapshot.
func (h *LiveConsoleHandler) GetWaitingRoom(w http.ResponseWriter, r *http.Request) {
	meta, _, ok := h.assertOwner(w, r)
	if !ok {
		return
	}
	snap, err := h.deps.GetWaitingRoomSnapshot(r.Context(), meta.ID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "waiting_room_failed")
		return
	}
	writeJSON(w, http.StatusOK, snap)
}

// EndStream terminates a live stream. Reasons: manual|depletion.
func (h *LiveConsoleHandler) EndStream(w http.ResponseWriter, r *http.Request) {
	meta, actor, ok := h.assertOwner(w, r)
	if !ok {
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_body")
		return
	}
	if body.Reason == "" {
		body.Reason = "manual"
	}
	if err := h.deps.EndStream(r.Context(), meta.ID, body.Reason, actor); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "end_stream_failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ended", "reason": body.Reason})
}

// --- helpers --------------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeJSONError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code})
}
