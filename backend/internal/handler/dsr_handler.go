package handler

// dsr_handler.go — HTTP surface for the DPDPA/GDPR Data Subject Request
// workflow (M10 E27-S3).
//
// Endpoints:
//
//	POST /api/v1/dsr                           — submit a new request
//	GET  /api/v1/dsr/{id}                      — poll status / fetch export
//	POST /api/v1/dsr/{id}/process-access       — synchronously build access bundle
//
// Authorization (F-018 / F-019): a DSR record carries a subject's full PII
// export bundle, so per-record reads/processing MUST be scoped. The
// submitting `api` route group only proves the caller is *some* authenticated
// user — it does NOT prove they are the named subject or a platform admin.
// `Get` and `ProcessAccess` therefore enforce authorization in-handler:
//   - platform admins ("super_admin" / "admin") may act on any DSR;
//   - a data subject may read ONLY their own DSR (JWT "sub" == subject_user_id);
//   - synchronous `ProcessAccess` is admin-only (production drives it from the
//     background worker; the sync route exists for admin review).
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

	"github.com/rawdrive/backend/internal/middleware"
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

// isPlatformAdmin reports whether the JWT claims carry an admin platform role.
func isPlatformAdmin(claims map[string]interface{}) bool {
	role, _ := claims["platform_role"].(string)
	return role == "super_admin" || role == "admin"
}

// claimsSubjectUserID returns the "sub" claim parsed as a UUID, if present
// and well-formed.
func claimsSubjectUserID(claims map[string]interface{}) (uuid.UUID, bool) {
	sub, _ := claims["sub"].(string)
	if sub == "" {
		return uuid.UUID{}, false
	}
	id, err := uuid.Parse(sub)
	if err != nil {
		return uuid.UUID{}, false
	}
	return id, true
}

// Get handles GET /api/v1/dsr/{id}.
//
// F-019: this returns a subject's full PII export bundle, so it is scoped to
// the platform admins OR the named subject themselves. A subject reading
// their own request never sees another subject's data; non-owners get 404 to
// avoid leaking the existence of a DSR by id (enumeration defence).
func (h *DSRHandler) Get(w http.ResponseWriter, r *http.Request) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"authentication required"}`, http.StatusUnauthorized)
		return
	}
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

	admin := isPlatformAdmin(claims)
	if !admin {
		// Non-admins may only read their OWN request. Treat both "not the
		// subject" and "subject not identifiable from the token" as 404 so an
		// attacker cannot confirm a DSR id exists for someone else.
		callerID, ok := claimsSubjectUserID(claims)
		if !ok || req.SubjectUserID == nil || *req.SubjectUserID != callerID {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		// The subject is the owner: only surface the export payload once the
		// request is completed. Pending/processing/failed reads return status
		// only (the field is json:",omitempty", so clearing it drops it).
		if req.Status != service.DSRStatusCompleted {
			req.ExportPayload = nil
		}
	}

	respondJSON(w, http.StatusOK, req)
}

// ProcessAccess handles POST /api/v1/dsr/{id}/process-access.
// In production this is invoked by the DSR background worker, but is also
// exposed for synchronous processing during admin review.
//
// F-018: synchronously processing a DSR collects and persists the subject's
// full PII into the export payload (and lets a caller hammer the exporter),
// so this route is restricted to platform admins. Non-admins are forbidden
// before any service work is done.
func (h *DSRHandler) ProcessAccess(w http.ResponseWriter, r *http.Request) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"authentication required"}`, http.StatusUnauthorized)
		return
	}
	if !isPlatformAdmin(claims) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
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
