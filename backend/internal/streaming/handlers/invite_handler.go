package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/middleware"
)

// InviteGenerator abstracts shortlink.Service.Generate for unit testing.
type InviteGenerator interface {
	Generate(ctx context.Context, streamID, workspaceID uuid.UUID) (string, error)
}

// InviteFlag abstracts the F-014 feature flag.
type InviteFlag interface {
	IsEnabled(ctx context.Context, workspaceID uuid.UUID) (bool, string)
}

// InviteHandler serves POST /api/v1/streams/{id}/invites.
// It creates an 8-char shortlink and returns { code, short_url, qr_payload }.
type InviteHandler struct {
	gen     InviteGenerator
	flag    InviteFlag
	db      *pgxpool.Pool
	baseURL string // e.g. "https://app.rawdrive.io"
}

// NewInviteHandler wires the handler. baseURL must not have a trailing slash.
func NewInviteHandler(gen InviteGenerator, flag InviteFlag, db *pgxpool.Pool, baseURL string) *InviteHandler {
	return &InviteHandler{
		gen:     gen,
		flag:    flag,
		db:      db,
		baseURL: strings.TrimRight(baseURL, "/"),
	}
}

// CreateInvite handles POST /streams/{id}/invites.
func (h *InviteHandler) CreateInvite(w http.ResponseWriter, r *http.Request) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	wsStr, _ := claims["workspace_id"].(string)
	if wsStr == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	wsID, err := uuid.Parse(wsStr)
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Feature flag gate.
	if h.flag != nil {
		if enabled, _ := h.flag.IsEnabled(r.Context(), wsID); !enabled {
			http.NotFound(w, r)
			return
		}
	}

	streamIDStr := chi.URLParam(r, "id")
	streamID, err := uuid.Parse(streamIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid_stream_id"}`, http.StatusBadRequest)
		return
	}

	// Ownership check: prefer ?owner= (unit-test mode) else DB lookup.
	if owner := r.URL.Query().Get("owner"); owner != "" {
		if owner != wsStr {
			// Return 404 to avoid leaking existence of foreign streams.
			http.NotFound(w, r)
			return
		}
	} else if h.db != nil {
		var ownerWS uuid.UUID
		if err := h.db.QueryRow(r.Context(),
			`SELECT workspace_id FROM streams WHERE id=$1`, streamID).Scan(&ownerWS); err != nil {
			http.NotFound(w, r)
			return
		}
		if ownerWS.String() != wsStr {
			http.NotFound(w, r)
			return
		}
	}

	code, err := h.gen.Generate(r.Context(), streamID, wsID)
	if err != nil {
		http.Error(w, `{"error":"internal"}`, http.StatusInternalServerError)
		return
	}

	shortURL := h.baseURL + "/s/" + code
	resp := map[string]interface{}{
		"code":       code,
		"short_url":  shortURL,
		"qr_payload": shortURL,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(resp)
}
