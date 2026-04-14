// M34 story 34-7: desktop preflight HTTP surface.
//
// This handler is a thin adapter over preflight.Service. All domain logic
// (CF input allocation, ownership verification, bandwidth aggregation,
// OBS template rendering, verdict classification) lives in the preflight
// package; the handler only enforces: (a) JWT presence, (b) workspace
// ownership, (c) rate-limit on /start, (d) feature flag gate.
//
// CRITICAL INVARIANTS (see AGENTS.md, spec 34-7):
//   - JWT claims MUST be read via middleware.JWTClaimsFromContext.
//   - /start is rate-limited to 1/min/user. Second call within window → 429.
//   - OBS profile body comes from the preflight session creds, NEVER from
//     streams.stream_key. Enforcement is in preflight.Service; the handler
//     never reaches into the streams table.
//   - Non-owner access to a session returns 404 (not 403) to avoid leaking
//     session existence across workspace boundaries.
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/streaming/preflight"
)

// PreflightService is the minimum surface the handler needs. preflight.Service
// satisfies this interface via adapter methods; tests substitute a fake.
type PreflightService interface {
	StartSession(ctx context.Context, actorID, workspaceID uuid.UUID) (preflight.Session, error)
	SessionWorkspace(ctx context.Context, sessionID uuid.UUID) (uuid.UUID, error)
	RecordBandwidth(ctx context.Context, sessionID uuid.UUID, r preflight.BandwidthResult) error
	GenerateOBSProfile(ctx context.Context, sessionID uuid.UUID) (body []byte, filename string, err error)
	StartTestBroadcast(ctx context.Context, sessionID uuid.UUID) error
	StopTestBroadcast(ctx context.Context, sessionID uuid.UUID) error
	CompleteSession(ctx context.Context, sessionID uuid.UUID) (preflight.Verdict, error)
}

// PreflightHandler serves the /api/v1/streams/preflight surface.
type PreflightHandler struct {
	svc         PreflightService
	FeatureFlag func() bool

	// rate-limit: 1/min/user (keyed on JWT subject).
	rlMu      sync.Mutex
	rlLast    map[string]time.Time
	RateLimit time.Duration
	Now       func() time.Time
}

// NewPreflightHandler wires the handler with sensible defaults. Callers may
// override FeatureFlag / Now / RateLimit before serving requests.
func NewPreflightHandler(svc PreflightService) *PreflightHandler {
	return &PreflightHandler{
		svc:         svc,
		FeatureFlag: func() bool { return true },
		rlLast:      map[string]time.Time{},
		RateLimit:   time.Minute,
		Now:         func() time.Time { return time.Now().UTC() },
	}
}

func (h *PreflightHandler) flagOn() bool {
	if h.FeatureFlag == nil {
		return true
	}
	return h.FeatureFlag()
}

func (h *PreflightHandler) denyFlag(w http.ResponseWriter) bool {
	if h.flagOn() {
		return false
	}
	http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
	return true
}

func (h *PreflightHandler) actor(w http.ResponseWriter, r *http.Request) (actorID, workspaceID uuid.UUID, ok bool) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
		return uuid.Nil, uuid.Nil, false
	}
	sub, _ := claims["sub"].(string)
	wsRaw, _ := claims["workspace_id"].(string)
	aid, aerr := uuid.Parse(sub)
	wsID, werr := uuid.Parse(wsRaw)
	if aerr != nil || werr != nil {
		http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
		return uuid.Nil, uuid.Nil, false
	}
	return aid, wsID, true
}

func writePreflightJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// Start issues a new preflight session. Rate-limited 1/min/user.
func (h *PreflightHandler) Start(w http.ResponseWriter, r *http.Request) {
	if h.denyFlag(w) {
		return
	}
	actorID, wsID, ok := h.actor(w, r)
	if !ok {
		return
	}

	// Rate-limit check (keyed by actor).
	key := actorID.String()
	now := h.Now()
	h.rlMu.Lock()
	if last, exists := h.rlLast[key]; exists && now.Sub(last) < h.RateLimit {
		h.rlMu.Unlock()
		http.Error(w, `{"error":"rate_limited"}`, http.StatusTooManyRequests)
		return
	}
	h.rlLast[key] = now
	h.rlMu.Unlock()

	sess, err := h.svc.StartSession(r.Context(), actorID, wsID)
	if err != nil {
		// Rollback rate-limit slot on failure so a flaky upstream does not
		// strand the user for 60s.
		h.rlMu.Lock()
		delete(h.rlLast, key)
		h.rlMu.Unlock()
		http.Error(w, `{"error":"preflight_start_failed"}`, http.StatusBadGateway)
		return
	}
	writePreflightJSON(w, http.StatusCreated, map[string]any{
		"sessionId":              sess.ID.String(),
		"testBroadcastId":        sess.TestBroadcastID,
		"rtmpsUrl":               sess.RTMPSUrl,
		"rtmpsKey":               sess.RTMPSKey,
		"expiresAt":              sess.ExpiresAt,
		"recommendedBitrateKbps": sess.RecommendedBitrateKbps,
	})
}

// resolveOwnedSession parses {sid} from the URL and verifies the caller owns
// the workspace that owns the session. Returns (sid, ok). On !ok the response
// has already been written.
func (h *PreflightHandler) resolveOwnedSession(w http.ResponseWriter, r *http.Request, callerWS uuid.UUID) (uuid.UUID, bool) {
	raw := chi.URLParam(r, "sid")
	sid, err := uuid.Parse(raw)
	if err != nil {
		http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
		return uuid.Nil, false
	}
	ws, err := h.svc.SessionWorkspace(r.Context(), sid)
	if err != nil {
		if errors.Is(err, preflight.ErrSessionNotFound) {
			http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
			return uuid.Nil, false
		}
		http.Error(w, `{"error":"internal"}`, http.StatusInternalServerError)
		return uuid.Nil, false
	}
	if ws != callerWS {
		// Do not leak existence across workspace boundaries.
		http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
		return uuid.Nil, false
	}
	return sid, true
}

// Bandwidth records a single client-measured bandwidth sample.
func (h *PreflightHandler) Bandwidth(w http.ResponseWriter, r *http.Request) {
	if h.denyFlag(w) {
		return
	}
	_, wsID, ok := h.actor(w, r)
	if !ok {
		return
	}
	sid, ok := h.resolveOwnedSession(w, r, wsID)
	if !ok {
		return
	}
	var body preflight.BandwidthResult
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid_payload"}`, http.StatusBadRequest)
		return
	}
	// Spec security invariant: reject pathological samples.
	if body.UplinkKbps > 10_000_000 || body.LossPct > 100 || body.JitterMs > 10_000 {
		http.Error(w, `{"error":"invalid_payload"}`, http.StatusBadRequest)
		return
	}
	if err := h.svc.RecordBandwidth(r.Context(), sid, body); err != nil {
		http.Error(w, `{"error":"internal"}`, http.StatusInternalServerError)
		return
	}
	writePreflightJSON(w, http.StatusOK, map[string]any{"accepted": true})
}

// OBSProfile returns the rendered encoder .ini for the session.
func (h *PreflightHandler) OBSProfile(w http.ResponseWriter, r *http.Request) {
	if h.denyFlag(w) {
		return
	}
	_, wsID, ok := h.actor(w, r)
	if !ok {
		return
	}
	sid, ok := h.resolveOwnedSession(w, r, wsID)
	if !ok {
		return
	}
	body, filename, err := h.svc.GenerateOBSProfile(r.Context(), sid)
	if err != nil {
		http.Error(w, `{"error":"obs_profile_failed"}`, http.StatusInternalServerError)
		return
	}
	if filename == "" {
		filename = "rawdrive-obs.ini"
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename=%q`, filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

// TestBroadcastStart promotes the ephemeral CF input into active state.
func (h *PreflightHandler) TestBroadcastStart(w http.ResponseWriter, r *http.Request) {
	if h.denyFlag(w) {
		return
	}
	_, wsID, ok := h.actor(w, r)
	if !ok {
		return
	}
	sid, ok := h.resolveOwnedSession(w, r, wsID)
	if !ok {
		return
	}
	if err := h.svc.StartTestBroadcast(r.Context(), sid); err != nil {
		http.Error(w, `{"error":"test_broadcast_start_failed"}`, http.StatusBadGateway)
		return
	}
	writePreflightJSON(w, http.StatusCreated, map[string]any{"status": "active"})
}

// TestBroadcastStop is idempotent.
func (h *PreflightHandler) TestBroadcastStop(w http.ResponseWriter, r *http.Request) {
	if h.denyFlag(w) {
		return
	}
	_, wsID, ok := h.actor(w, r)
	if !ok {
		return
	}
	sid, ok := h.resolveOwnedSession(w, r, wsID)
	if !ok {
		return
	}
	if err := h.svc.StopTestBroadcast(r.Context(), sid); err != nil {
		http.Error(w, `{"error":"test_broadcast_stop_failed"}`, http.StatusBadGateway)
		return
	}
	writePreflightJSON(w, http.StatusOK, map[string]any{"status": "stopped"})
}

// Complete computes and returns the verdict.
func (h *PreflightHandler) Complete(w http.ResponseWriter, r *http.Request) {
	if h.denyFlag(w) {
		return
	}
	_, wsID, ok := h.actor(w, r)
	if !ok {
		return
	}
	sid, ok := h.resolveOwnedSession(w, r, wsID)
	if !ok {
		return
	}
	v, err := h.svc.CompleteSession(r.Context(), sid)
	if err != nil {
		http.Error(w, `{"error":"complete_failed"}`, http.StatusInternalServerError)
		return
	}
	writePreflightJSON(w, http.StatusOK, v)
}
