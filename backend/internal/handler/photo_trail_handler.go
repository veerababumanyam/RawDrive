package handler

import (
	"net/http"
	"strconv"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
)

// M39 E9-S1 (FR-F06): photo-trail HTTP handler.
//
// The handler is deliberately thin: it pulls the caller UUID from JWT
// claims via middleware.JWTClaimsFromContext (SEC-F08, never from query
// params) and delegates to PhotoTrailService for the actual identity
// enforcement, 30-day window, and action whitelist (SEC-F07).
type PhotoTrailHandler struct {
	svc *service.PhotoTrailService
}

func NewPhotoTrailHandler(svc *service.PhotoTrailService) *PhotoTrailHandler {
	return &PhotoTrailHandler{svc: svc}
}

// List handles GET /api/v1/photo-trail. Returns 401 without a JWT.
// query params: ?limit=20&cursor=<uuid>
func (h *PhotoTrailHandler) List(w http.ResponseWriter, r *http.Request) {
	caller := middleware.GetActorID(r.Context())
	if caller == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	q := r.URL.Query()
	limit := 20
	if s := q.Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			limit = n
		}
	}
	var cursor *uuid.UUID
	if s := q.Get("cursor"); s != "" {
		if id, err := uuid.Parse(s); err == nil {
			cursor = &id
		}
	}
	res, err := h.svc.List(r.Context(), caller, cursor, limit)
	if err != nil {
		http.Error(w, `{"error":"failed to load photo trail"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, res)
}
