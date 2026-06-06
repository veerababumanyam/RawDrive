package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
)

type AdminPricingChangeRequestsHandler struct {
	changes *service.PricingChangeRequestService
}

func NewAdminPricingChangeRequestsHandler(changes *service.PricingChangeRequestService) *AdminPricingChangeRequestsHandler {
	return &AdminPricingChangeRequestsHandler{changes: changes}
}

type createPricingChangeRequestBody struct {
	RequestType   string         `json:"request_type"`
	TargetType    string         `json:"target_type"`
	TargetKey     string         `json:"target_key"`
	BeforeState   map[string]any `json:"before_state"`
	AfterState    map[string]any `json:"after_state"`
	ImpactSummary map[string]any `json:"impact_summary"`
	EmailPreview  map[string]any `json:"email_preview"`
}

type approvalBody struct {
	Comment       string  `json:"comment"`
	EffectiveFrom *string `json:"effective_from"`
}

type rejectionBody struct {
	Reason string `json:"reason"`
}

func (h *AdminPricingChangeRequestsHandler) List(w http.ResponseWriter, r *http.Request) {
	if h.changes == nil {
		respondJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "pricing changes unavailable"})
		return
	}
	requests, err := h.changes.List(r.Context(), strings.TrimSpace(r.URL.Query().Get("status")))
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "list pricing changes failed"})
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"requests": requests})
}

func (h *AdminPricingChangeRequestsHandler) Create(w http.ResponseWriter, r *http.Request) {
	if h.changes == nil {
		respondJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "pricing changes unavailable"})
		return
	}
	var body createPricingChangeRequestBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	req, err := h.changes.Create(r.Context(), service.CreatePricingChangeRequestInput{
		RequestType:   body.RequestType,
		TargetType:    body.TargetType,
		TargetKey:     body.TargetKey,
		BeforeState:   body.BeforeState,
		AfterState:    body.AfterState,
		ImpactSummary: body.ImpactSummary,
		EmailPreview:  body.EmailPreview,
		ActorID:       actorIDFromAdminRequest(r),
	})
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	respondJSON(w, http.StatusCreated, map[string]any{"request": req})
}

func (h *AdminPricingChangeRequestsHandler) Submit(w http.ResponseWriter, r *http.Request) {
	h.transition(w, r, func(id uuid.UUID, actorID *uuid.UUID) (service.PricingChangeRequest, error) {
		return h.changes.Submit(r.Context(), id, actorID)
	})
}

func (h *AdminPricingChangeRequestsHandler) Approve(w http.ResponseWriter, r *http.Request) {
	if !isSuperAdminRequest(r) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "super_admin required"})
		return
	}
	var body approvalBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	var effectiveFrom *time.Time
	if body.EffectiveFrom != nil && strings.TrimSpace(*body.EffectiveFrom) != "" {
		parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(*body.EffectiveFrom))
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "effective_from must be RFC3339"})
			return
		}
		effectiveFrom = &parsed
	}
	h.transition(w, r, func(id uuid.UUID, actorID *uuid.UUID) (service.PricingChangeRequest, error) {
		return h.changes.Approve(r.Context(), id, actorID, body.Comment, effectiveFrom)
	})
}

func (h *AdminPricingChangeRequestsHandler) Reject(w http.ResponseWriter, r *http.Request) {
	if !isSuperAdminRequest(r) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "super_admin required"})
		return
	}
	var body rejectionBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	h.transition(w, r, func(id uuid.UUID, actorID *uuid.UUID) (service.PricingChangeRequest, error) {
		return h.changes.Reject(r.Context(), id, actorID, body.Reason)
	})
}

func (h *AdminPricingChangeRequestsHandler) Publish(w http.ResponseWriter, r *http.Request) {
	if !isSuperAdminRequest(r) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "super_admin required"})
		return
	}
	h.transition(w, r, func(id uuid.UUID, actorID *uuid.UUID) (service.PricingChangeRequest, error) {
		return h.changes.Publish(r.Context(), id, actorID)
	})
}

func (h *AdminPricingChangeRequestsHandler) PreviewCatalog(w http.ResponseWriter, r *http.Request) {
	if !isSuperAdminRequest(r) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "super_admin required"})
		return
	}
	id, ok := pricingChangeRequestID(w, r)
	if !ok {
		return
	}
	catalog, err := h.changes.PreviewCatalog(r.Context(), id)
	if errors.Is(err, service.ErrPricingChangeRequestNotFound) {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "pricing change request not found"})
		return
	}
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "preview catalog failed"})
		return
	}
	respondJSON(w, http.StatusOK, catalog)
}

func (h *AdminPricingChangeRequestsHandler) transition(w http.ResponseWriter, r *http.Request, fn func(uuid.UUID, *uuid.UUID) (service.PricingChangeRequest, error)) {
	if h.changes == nil {
		respondJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "pricing changes unavailable"})
		return
	}
	id, ok := pricingChangeRequestID(w, r)
	if !ok {
		return
	}
	req, err := fn(id, actorIDFromAdminRequest(r))
	if errors.Is(err, service.ErrPricingChangeRequestNotFound) {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "pricing change request not found"})
		return
	}
	if errors.Is(err, service.ErrPricingChangeRequestInvalidStatus) {
		respondJSON(w, http.StatusConflict, map[string]string{"error": "invalid pricing change request status"})
		return
	}
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"request": req})
}

func pricingChangeRequestID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(strings.TrimSpace(chi.URLParam(r, "id")))
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request id"})
		return uuid.Nil, false
	}
	return id, true
}

func actorIDFromAdminRequest(r *http.Request) *uuid.UUID {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		return nil
	}
	sub, _ := claims["sub"].(string)
	id, err := uuid.Parse(sub)
	if err != nil {
		return nil
	}
	return &id
}

func isSuperAdminRequest(r *http.Request) bool {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		return false
	}
	role, _ := claims["platform_role"].(string)
	return role == "super_admin"
}
