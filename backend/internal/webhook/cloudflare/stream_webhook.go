package cloudflare

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"time"
)

const maxBodyBytes = 64 * 1024 // defense against large-body DoS

// StreamRepo is the persistence surface the webhook writes to.
type StreamRepo interface {
	GetByCFUID(ctx context.Context, uid string) (*Stream, error)
	UpdateLiveState(ctx context.Context, streamID string, state string) error
	UpdateReplayState(ctx context.Context, streamID string, state string, replayURL string, expiresAt *time.Time) error
}

// Stream is the minimal record the webhook needs to route an event. The
// repo layer fills this out; extra fields are irrelevant here.
type Stream struct {
	ID        string
	CFUID     string
	PlanTier  string // "standard" | "professional" | "enterprise"
}

// EventDeliveryRepo records every webhook delivery for operational audit.
type EventDeliveryRepo interface {
	LogEvent(ctx context.Context, streamID string, evt StreamEvent) error
}

// ReplayReconciler is the E105-S6 hook called on recording.ready.
type ReplayReconciler interface {
	OnRecordingReady(ctx context.Context, streamUID string, videoID string, replayURL string) error
}

// Handler is the HTTP entry point for Cloudflare Stream webhooks.
type Handler struct {
	verifier SignatureVerifier
	streams  StreamRepo
	delivery EventDeliveryRepo
	replay   ReplayReconciler
	clock    func() time.Time
	logger   *slog.Logger
}

func NewHandler(v SignatureVerifier, s StreamRepo, d EventDeliveryRepo, r ReplayReconciler, logger *slog.Logger) *Handler {
	if logger == nil {
		logger = slog.Default()
	}
	return &Handler{
		verifier: v,
		streams:  s,
		delivery: d,
		replay:   r,
		clock:    time.Now,
		logger:   logger,
	}
}

// ServeHTTP implements http.Handler. The handler:
//   1. Reads the body under a size limit
//   2. Verifies the Webhook-Signature header (HMAC-SHA256, anti-replay window)
//   3. Parses the event
//   4. Dispatches known event types to the state machine, acks 200
//   5. Unknown events → 200 (so CF does not retry)
//
// Per NFR-014-PERF-02 the happy path must complete under 500ms p95. This
// handler keeps writes synchronous to preserve ordering; if DB latency
// threatens the budget, callers should move to an async queue.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if rec := recover(); rec != nil {
			h.logger.Error("webhook panic", "recover", rec)
			http.Error(w, "internal error", http.StatusInternalServerError)
		}
	}()

	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBodyBytes+1))
	if err != nil {
		http.Error(w, "read body", http.StatusBadRequest)
		return
	}
	if len(body) > maxBodyBytes {
		http.Error(w, "body too large", http.StatusRequestEntityTooLarge)
		return
	}

	sig := r.Header.Get("Webhook-Signature")
	if err := h.verifier.Verify(body, sig, h.clock()); err != nil {
		// Do NOT log the full signature header — redact.
		h.logger.Warn("webhook signature reject", "reason", err.Error())
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var evt StreamEvent
	if err := json.Unmarshal(body, &evt); err != nil {
		http.Error(w, "malformed json", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	if err := h.dispatch(ctx, evt); err != nil {
		h.logger.Error("webhook dispatch error", "err", err.Error(), "type", string(evt.Type))
		http.Error(w, "internal", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *Handler) dispatch(ctx context.Context, evt StreamEvent) error {
	if !evt.IsKnown() {
		h.logger.Info("webhook unknown event", "type", string(evt.Type))
		return nil
	}

	s, err := h.streams.GetByCFUID(ctx, evt.UID)
	if err != nil || s == nil {
		// Dead-letter: log, do not fail the webhook (CF would retry fruitlessly).
		h.logger.Warn("webhook unknown stream", "uid", evt.UID, "type", string(evt.Type))
		return nil
	}

	// Best-effort delivery log; errors are logged but do not fail the webhook.
	if h.delivery != nil {
		if err := h.delivery.LogEvent(ctx, s.ID, evt); err != nil {
			h.logger.Warn("webhook delivery log error", "err", err.Error())
		}
	}

	switch evt.Type {
	case EvtLiveInputConnected:
		return h.streams.UpdateLiveState(ctx, s.ID, "live")
	case EvtLiveInputDisconnected:
		return h.streams.UpdateLiveState(ctx, s.ID, "ended")
	case EvtLiveInputErrored:
		return h.streams.UpdateLiveState(ctx, s.ID, "failed")
	case EvtRecordingReady:
		replayURL := extractReplayURL(evt.Payload)
		if h.replay != nil {
			return h.replay.OnRecordingReady(ctx, evt.UID, evt.VideoID, replayURL)
		}
		// Fallback direct write with an unset expiry (S6 fills in tiering).
		return h.streams.UpdateReplayState(ctx, s.ID, "available", replayURL, nil)
	case EvtRecordingDeleted:
		return h.streams.UpdateReplayState(ctx, s.ID, "deleted", "", nil)
	}
	return nil
}

func extractReplayURL(p json.RawMessage) string {
	if len(p) == 0 {
		return ""
	}
	var m struct {
		ReplayURL string `json:"replayUrl"`
	}
	_ = json.Unmarshal(p, &m)
	return m.ReplayURL
}
