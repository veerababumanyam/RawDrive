// Package handlers — ViewerPublicHandler (M35 / E107-S4).
//
// Public viewer-scope HTTP surface wrapping viewer.ViewerCountCache and
// viewer.ReplayGate. Distinct from the M34 owner-console handler at
// /api/v1/streaming/streams/{id}/viewers — this handler is mounted under
// /api/v1/public/streams/{id}/... and requires a VIEWER JWT (not user JWT).
//
// Security invariants (see 35-4-impl-spec.md):
//   - Replay expiry is server-authoritative. Client-supplied expiry is never
//     consulted — only viewer.ReplayGate.Decide + streams.replay_expires_at.
//   - Viewer-count response exposes ONLY {current, as_of}. peak/unique are
//     stripped at the cache boundary (viewer.PublicViewerCount) so no
//     serializer path can leak them.
//   - F-014 feature flag gate returns 404 (anti-enumeration) when disabled.
//   - Viewer JWT must bind to the shortlink/stream in the path — tokens
//     issued for a different stream are rejected 401.
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/streaming/viewer"
)

// ReplayStreamMeta is the slice of streams(...) columns the replay handler
// needs. It lives here (not in viewer/) because the lookup is by the
// authed context's stream UUID; the viewer package does not know about
// repositories.
type ReplayStreamMeta struct {
	StreamID      uuid.UUID
	WorkspaceID   uuid.UUID
	State         viewer.ReplayState
	ExpiresAt     time.Time
	ReplayVideoID string
}

// ReplayStreamRepo loads replay metadata for a stream. Implementations
// return ErrReplayStreamNotFound when the row is missing.
type ReplayStreamRepo interface {
	LoadReplay(ctx context.Context, streamID uuid.UUID) (*ReplayStreamMeta, error)
}

// ErrReplayStreamNotFound is returned by ReplayStreamRepo.LoadReplay when no
// row matches. Handler maps to 404.
var ErrReplayStreamNotFound = errors.New("handlers: replay stream not found")

// ViewerPublicHandler serves the two public viewer endpoints.
type ViewerPublicHandler struct {
	cache       *viewer.ViewerCountCache
	gate        *viewer.ReplayGate
	parser      *viewer.Service
	repo        ReplayStreamRepo
	flag        LiveConsoleFeatureFlag
	workspaceID uuid.UUID // flag scoping — wired from route-owning workspace context
	now         func() time.Time
}

// NewViewerPublicHandler wires the handler. Any nil dep degrades its
// endpoint to 404/500; the struct itself is always safe to mount.
func NewViewerPublicHandler(
	cache *viewer.ViewerCountCache,
	gate *viewer.ReplayGate,
	parser *viewer.Service,
	repo ReplayStreamRepo,
	flag LiveConsoleFeatureFlag,
	workspaceID uuid.UUID,
	clock func() time.Time,
) *ViewerPublicHandler {
	if clock == nil {
		clock = time.Now
	}
	return &ViewerPublicHandler{
		cache:       cache,
		gate:        gate,
		parser:      parser,
		repo:        repo,
		flag:        flag,
		workspaceID: workspaceID,
		now:         clock,
	}
}

// authViewer parses the viewer JWT from the Authorization header and
// verifies it binds to the path's {id}. Returns (streamID, true) on
// success; otherwise has already written 401.
func (h *ViewerPublicHandler) authViewer(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	tok := bearerToken(r)
	if tok == "" || h.parser == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return uuid.Nil, false
	}
	claims, err := h.parser.Parse(tok)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return uuid.Nil, false
	}
	streamID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		// 404 anti-enumeration on malformed path id.
		writeJSONError(w, http.StatusNotFound, "not_found")
		return uuid.Nil, false
	}
	if !strings.EqualFold(claims.StreamID, streamID.String()) {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return uuid.Nil, false
	}
	return streamID, true
}

// featureOK checks the F-014 flag for the handler's bound workspace and
// writes a 404 if disabled.
func (h *ViewerPublicHandler) featureOK(w http.ResponseWriter, r *http.Request) bool {
	if h.flag == nil {
		return true
	}
	ok, _ := h.flag.IsEnabled(r.Context(), h.workspaceID)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "not_found")
		return false
	}
	return true
}

// GetViewerCount → GET /api/v1/public/streams/{id}/viewer-count.
// 200: {current,as_of} · 401 invalid JWT · 404 flag off / bad path.
func (h *ViewerPublicHandler) GetViewerCount(w http.ResponseWriter, r *http.Request) {
	if !h.featureOK(w, r) {
		return
	}
	streamID, ok := h.authViewer(w, r)
	if !ok {
		return
	}
	if h.cache == nil {
		writeJSONError(w, http.StatusInternalServerError, "cache_unavailable")
		return
	}
	cnt, err := h.cache.GetCurrent(r.Context(), streamID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "viewer_count_failed")
		return
	}
	w.Header().Set("Cache-Control", "max-age=5")
	writeJSON(w, http.StatusOK, cnt)
}

// replayResponse is the 200 payload. Field names match the spec contract
// consumed by lib/viewerApi.ts.
type replayResponse struct {
	PlaybackURL string    `json:"playback_url"`
	ExpiresAt   time.Time `json:"expires_at"`
	BannerFlag  bool      `json:"banner_flag"`
}

// GetReplay → GET /api/v1/public/streams/{id}/replay.
// 200 available · 410 expired · 409 processing · 404 missing / flag off.
func (h *ViewerPublicHandler) GetReplay(w http.ResponseWriter, r *http.Request) {
	if !h.featureOK(w, r) {
		return
	}
	streamID, ok := h.authViewer(w, r)
	if !ok {
		return
	}
	if h.repo == nil || h.gate == nil {
		writeJSONError(w, http.StatusInternalServerError, "replay_unavailable")
		return
	}

	meta, err := h.repo.LoadReplay(r.Context(), streamID)
	if err != nil {
		if errors.Is(err, ErrReplayStreamNotFound) {
			writeJSONError(w, http.StatusNotFound, "not_found")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "replay_lookup_failed")
		return
	}

	decision, err := h.gate.Decide(r.Context(), viewer.ReplayInputs{
		StreamID:      meta.StreamID,
		State:         meta.State,
		ExpiresAt:     meta.ExpiresAt,
		ReplayVideoID: meta.ReplayVideoID,
	})
	if err != nil {
		switch {
		case errors.Is(err, viewer.ErrReplayExpired):
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusGone)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error":      "replay_expired",
				"expires_at": meta.ExpiresAt,
			})
			return
		case errors.Is(err, viewer.ErrReplayProcessing):
			w.Header().Set("Cache-Control", "no-store")
			writeJSONError(w, http.StatusConflict, "replay_processing")
			return
		case errors.Is(err, viewer.ErrReplayNotFound):
			writeJSONError(w, http.StatusNotFound, "not_found")
			return
		default:
			writeJSONError(w, http.StatusInternalServerError, "replay_gate_failed")
			return
		}
	}

	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, replayResponse{
		PlaybackURL: decision.PlaybackURL,
		ExpiresAt:   decision.ExpiresAt,
		BannerFlag:  decision.BannerFlag,
	})
}

// bearerToken mirrors middleware.bearerToken (unexported there).
func bearerToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		return ""
	}
	parts := strings.SplitN(auth, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}
