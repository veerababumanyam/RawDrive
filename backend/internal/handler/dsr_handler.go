package handler

// dsr_handler.go — HTTP surface for the DPDPA/GDPR Data Subject Request
// workflow (M10 E27-S3).
//
// Endpoints (no auth — subjects don't necessarily have a logged-in user):
//
//	POST /api/v1/dsr                           — submit a new request
//	GET  /api/v1/dsr/{id}                      — poll status / fetch export
//	POST /api/v1/dsr/{id}/process-access       — synchronously build access bundle
//
// The submission endpoint is intentionally rate-limited at the network
// edge rather than per-IP here, because subjects may submit from shared
// networks (university, café). The 24-hour dedup window enforced by the
// service prevents the abuse vector that per-IP limits would catch.

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/service"
)

// DSRHandler handles data subject request endpoints.
type DSRHandler struct {
	svc *service.DSRService
}

// NewDSRHandler creates the handler.
func NewDSRHandler(svc *service.DSRService) *DSRHandler {
	return &DSRHandler{svc: svc}
}

// Submit handles POST /api/v1/dsr.
// Body: {"subject_email": "...", "request_type": "access|erasure|rectify"}
func (h *DSRHandler) Submit(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SubjectEmail string `json:"subject_email"`
		RequestType  string `json:"request_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	req, err := h.svc.SubmitRequest(r.Context(), body.SubjectEmail, nil, service.DSRRequestType(body.RequestType))
	if err != nil {
		switch {
		case errors.Is(err, service.ErrDSRInvalidEmail):
			http.Error(w, `{"error":"subject_email required"}`, http.StatusBadRequest)
		case errors.Is(err, service.ErrDSRInvalidType):
			http.Error(w, `{"error":"request_type must be access, erasure, or rectify"}`, http.StatusBadRequest)
		case errors.Is(err, service.ErrDSRDuplicate):
			http.Error(w, `{"error":"a request of this type was submitted within the past 24 hours"}`, http.StatusTooManyRequests)
		default:
			log.Printf("dsr submit: %v", err)
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		}
		return
	}

	respondJSON(w, http.StatusAccepted, map[string]any{
		"id":           req.ID,
		"status":       req.Status,
		"request_type": req.RequestType,
		"requested_at": req.RequestedAt,
	})
}

// Get handles GET /api/v1/dsr/{id}.
func (h *DSRHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid request id"}`, http.StatusBadRequest)
		return
	}
	req, err := h.svc.GetRequest(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrDSRNotFound) {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		log.Printf("dsr get %s: %v", id, err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, req)
}

// ProcessAccess handles POST /api/v1/dsr/{id}/process-access.
// In production this is invoked by the DSR background worker, but is also
// exposed for synchronous processing during admin review.
func (h *DSRHandler) ProcessAccess(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid request id"}`, http.StatusBadRequest)
		return
	}
	req, err := h.svc.ProcessAccessRequest(r.Context(), id)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrDSRNotFound):
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		case errors.Is(err, service.ErrDSRExporterNotSet):
			http.Error(w, `{"error":"exporter not configured"}`, http.StatusServiceUnavailable)
		default:
			log.Printf("dsr process access %s: %v", id, err)
			http.Error(w, `{"error":"export failed"}`, http.StatusInternalServerError)
		}
		return
	}
	respondJSON(w, http.StatusOK, req)
}
