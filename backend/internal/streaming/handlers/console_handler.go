// Package handlers — M34 story 34-1.
//
// ConsoleHandler serves GET /api/v1/streaming/streams/{id}/console — the
// photographer-facing stream dashboard aggregate payload with five tabs
// (Overview, Setup, Live, Replay, Audit).
//
// Security invariants (from impl-spec, packet):
//   * Owner-scoped: caller's workspace_id claim must equal stream.workspace_id.
//     Cross-workspace returns 404 (anti-enumeration), not 403.
//   * Feature-flag gated: flag off → 404 (never 403, same anti-enum reason).
//   * Ingest credentials are nil unless within T-30 window AND caller has a
//     prior reveal-audit row. (This handler currently checks window + audit
//     count; the "reveal-audit by THIS user" persistence layer lands alongside
//     story 34-4; the interface is already shaped that way.)
//   * No local context-key types — we use middleware.JWTClaimsFromContext.
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
)

// ErrStreamNotFound signals either "no row for (stream_id)" OR "row exists but
// caller's workspace does not match" — the handler treats both identically so
// cross-workspace probes cannot distinguish existent vs non-existent IDs.
var ErrStreamNotFound = errors.New("console: stream not found")

// ConsoleStream is the minimum stream row the console aggregate needs. The
// real persistence layer (backend/internal/streaming/repository) will return
// the same shape; tests supply an in-memory fake.
type ConsoleStream struct {
	ID                   uuid.UUID
	WorkspaceID          uuid.UUID
	Title                string
	Status               string
	StartAt              time.Time
	EndAt                time.Time
	PackageID            uuid.UUID
	AccessPolicy         string
	ChatPolicy           string
	ReplayEnabled        bool
	RTMPSURL             string
	StreamKey            string // SECRET — only serialised within T-30 window
	SRTURL               string
	SRTPasskey           string // SECRET
}

// ConsoleStore is the read surface the handler needs. Kept handler-local so
// this story doesn't wait on a concrete repo impl.
type ConsoleStore interface {
	LoadStreamForOwner(ctx context.Context, streamID, workspaceID uuid.UUID) (*ConsoleStream, error)
	CountRevealAudit(ctx context.Context, streamID, userID uuid.UUID) (int, error)
}

// ConsoleFeatureFlag is the minimal slice of featureflag.StreamingCommercialFlag
// the handler calls — accepted as an interface so tests can swap it.
type ConsoleFeatureFlag interface {
	IsEnabled(ctx context.Context, workspaceID uuid.UUID) (bool, string)
}

// ConsoleHandler serves the console aggregate.
type ConsoleHandler struct {
	store ConsoleStore
	flag  ConsoleFeatureFlag
	clock func() time.Time
}

// NewConsoleHandler wires the handler.
func NewConsoleHandler(store ConsoleStore, flag ConsoleFeatureFlag, clock func() time.Time) *ConsoleHandler {
	if clock == nil {
		clock = time.Now
	}
	return &ConsoleHandler{store: store, flag: flag, clock: clock}
}

// GetConsole handles GET /api/v1/streaming/streams/{id}/console.
func (h *ConsoleHandler) GetConsole(w http.ResponseWriter, r *http.Request) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	wsStr, _ := claims["workspace_id"].(string)
	if wsStr == "" {
		http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
		return
	}
	workspaceID, err := uuid.Parse(wsStr)
	if err != nil {
		http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
		return
	}
	userID, _ := claims["sub"].(string)
	userUUID, _ := uuid.Parse(userID)

	streamIDStr := chi.URLParam(r, "id")
	streamID, err := uuid.Parse(streamIDStr)
	if err != nil {
		// Unknown UUID → treat as not-found (anti-enum).
		http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
		return
	}

	// Feature-flag gate — off returns 404 not 403 to avoid enumeration.
	if h.flag != nil {
		if enabled, _ := h.flag.IsEnabled(r.Context(), workspaceID); !enabled {
			http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
			return
		}
	}

	stream, err := h.store.LoadStreamForOwner(r.Context(), streamID, workspaceID)
	if err != nil || stream == nil {
		http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
		return
	}

	payload := map[string]any{
		"stream_meta": map[string]any{
			"id":             stream.ID,
			"workspace_id":   stream.WorkspaceID,
			"title":          stream.Title,
			"status":         stream.Status,
			"start_at":       stream.StartAt,
			"end_at":         stream.EndAt,
			"access_policy":  stream.AccessPolicy,
			"chat_policy":    stream.ChatPolicy,
			"replay_enabled": stream.ReplayEnabled,
		},
		"tabs": map[string]any{
			"overview": map[string]any{"available": true},
			"setup":    map[string]any{"available": true},
			"live":     map[string]any{"available": true},
			"replay":   map[string]any{"available": stream.ReplayEnabled},
			"audit":    map[string]any{"available": true},
		},
		"ingest_creds": h.redactIngest(r.Context(), stream, userUUID),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(payload)
}

// redactIngest returns the ingest credential view only when BOTH gates pass:
//  1. now() ∈ [start_at − 30min, end_at]
//  2. a prior ingest_reveal_audit row exists for (stream_id, user_id)
//
// This matches the packet invariant: ingest keys MUST NOT leak pre-T-30.
func (h *ConsoleHandler) redactIngest(ctx context.Context, s *ConsoleStream, userID uuid.UUID) any {
	now := h.clock()
	if !isWithinT30(s.StartAt, s.EndAt, now) {
		return nil
	}
	// Reveal-audit gate. When store is unavailable, default to "no reveal".
	if h.store == nil {
		return nil
	}
	count, err := h.store.CountRevealAudit(ctx, s.ID, userID)
	if err != nil || count < 1 {
		return nil
	}
	return map[string]any{
		"rtmps_url":   s.RTMPSURL,
		"stream_key":  s.StreamKey,
		"srt_url":     s.SRTURL,
		"srt_passkey": s.SRTPasskey,
	}
}

// isWithinT30 reports whether now is in [startAt − 30min, endAt].
func isWithinT30(startAt, endAt, now time.Time) bool {
	open := startAt.Add(-30 * time.Minute)
	return !now.Before(open) && !now.After(endAt)
}
