// Package rate — HTTP handler for super-admin streaming-rate CRUD.
//
// Mounted under /api/v1/admin/streaming/packages/* by RegisterAdminStreamingRoutes.
package rate

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/middleware"
)

// Handler wraps a *Service with HTTP adapters.
type Handler struct {
	svc *Service
}

// NewHandler constructs a Handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// RegisterAdminStreamingRoutes mounts the super-admin streaming CRUD under
// /api/v1/admin/streaming/*. Caller must already have applied RequireAuth +
// RequirePlatformRole("super_admin") at the parent chi.Router.
func RegisterAdminStreamingRoutes(r chi.Router, h *Handler) {
	r.Route("/api/v1/admin/streaming", func(sr chi.Router) {
		sr.Use(middleware.RequireAuth)
		sr.Use(middleware.RequirePlatformRole("super_admin"))

		sr.Get("/packages",                h.ListPackages)
		sr.Post("/packages",               h.CreatePackage)
		sr.Get("/packages/{id}",           h.GetPackage)
		sr.Patch("/packages/{id}",         h.PatchPackage)
		sr.Get("/packages/{id}/rates",     h.ListRateCards)
		sr.Post("/packages/{id}/rate",     h.CreateRateCard)
	})
}

// ListPackages — GET /api/v1/admin/streaming/packages
func (h *Handler) ListPackages(w http.ResponseWriter, r *http.Request) {
	pkgs, err := h.svc.ListPackages(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	if pkgs == nil {
		pkgs = []Package{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"packages": pkgs})
}

// GetPackage — GET /api/v1/admin/streaming/packages/{id}
func (h *Handler) GetPackage(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}
	pkg, err := h.svc.GetPackage(r.Context(), id)
	if errors.Is(err, ErrPackageNotFound) {
		writeError(w, http.StatusNotFound, "not_found", err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "get_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, pkg)
}

// CreatePackage — POST /api/v1/admin/streaming/packages
func (h *Handler) CreatePackage(w http.ResponseWriter, r *http.Request) {
	var in CreatePackageInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	pkg, err := h.svc.CreatePackage(r.Context(), in)
	switch {
	case errors.Is(err, ErrInvalidTier),
		errors.Is(err, ErrNonPositiveMinutes),
		errors.Is(err, ErrNonPositiveViewers),
		errors.Is(err, ErrNonPositiveTTL):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, pkg)
}

// PatchPackage — PATCH /api/v1/admin/streaming/packages/{id}
func (h *Handler) PatchPackage(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}
	var in PatchPackageInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	pkg, err := h.svc.PatchPackage(r.Context(), id, in)
	switch {
	case errors.Is(err, ErrNonPositiveMinutes),
		errors.Is(err, ErrNonPositiveViewers),
		errors.Is(err, ErrNonPositiveTTL):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	case errors.Is(err, ErrPackageNotFound):
		writeError(w, http.StatusNotFound, "not_found", err.Error())
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, "patch_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, pkg)
}

// ListRateCards — GET /api/v1/admin/streaming/packages/{id}/rates
func (h *Handler) ListRateCards(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}
	cards, err := h.svc.ListRateCards(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	if cards == nil {
		cards = []RateCard{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"rate_cards": cards})
}

// CreateRateCard — POST /api/v1/admin/streaming/packages/{id}/rate
func (h *Handler) CreateRateCard(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}
	var in CreateRateCardInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}

	// Pull the creating user from JWT claims (nil-safe).
	var createdBy *uuid.UUID
	if claims := middleware.JWTClaimsFromContext(r.Context()); claims != nil {
		if sub, ok := claims["sub"].(string); ok {
			if uid, err := uuid.Parse(sub); err == nil {
				createdBy = &uid
			}
		}
	}

	rc, err := h.svc.CreateRateCard(r.Context(), id, createdBy, in)
	switch {
	case errors.Is(err, ErrNonPositivePrice),
		errors.Is(err, ErrNonPositiveRate),
		errors.Is(err, ErrEffectiveFromPast):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	case errors.Is(err, ErrDuplicateEffectiveFrom):
		writeError(w, http.StatusConflict, "duplicate_effective_from", err.Error())
		return
	case errors.Is(err, ErrPackageNotFound):
		writeError(w, http.StatusNotFound, "not_found", err.Error())
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, rc)
}

// ----- helpers -----

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": code, "message": message})
}
