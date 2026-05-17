package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

type DealerHandler struct {
	svc      *service.DealerService
	auditLog *service.AuditLogService // M39 E7-S2: emit admin.dealer.delete audit on soft-delete
}

func NewDealerHandler(svc *service.DealerService) *DealerHandler {
	return &DealerHandler{svc: svc}
}

// WithAuditLog returns the handler configured with an audit-log emitter for
// admin mutations (M39 E7-S2). Nil audit service is allowed; audit emission
// is skipped silently to keep the existing constructors backward-compatible.
func (h *DealerHandler) WithAuditLog(a *service.AuditLogService) *DealerHandler {
	h.auditLog = a
	return h
}

func (h *DealerHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var req service.CreateDealerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	dealer, err := h.svc.AdminCreateDealer(r.Context(), userID, req)
	if err != nil {
		switch err {
		case service.ErrDealerAlreadyExists:
			http.Error(w, `{"error":"dealer already registered for this user"}`, http.StatusConflict)
		case service.ErrAgreementRequired:
			http.Error(w, `{"error":"agreement acceptance is required"}`, http.StatusBadRequest)
		case service.ErrInvalidPAN:
			http.Error(w, `{"error":"invalid PAN number format"}`, http.StatusBadRequest)
		case service.ErrInvalidGSTIN:
			http.Error(w, `{"error":"invalid GSTIN format"}`, http.StatusBadRequest)
		default:
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		}
		return
	}
	respondJSON(w, http.StatusCreated, dealer)
}

func (h *DealerHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := repository.DealerFilter{
		Status: q.Get("status"),
		Q:      q.Get("q"), // M39 E7-S2: admin search by business_name/email/phone
		Limit:  20,
	}
	if limitStr := q.Get("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 && limit <= 100 {
			filter.Limit = limit
		}
	}
	dealers, err := h.svc.ListDealers(r.Context(), filter)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, dealers)
}

// Delete soft-deletes a dealer (M39 E7-S2).
// Returns 204 on success, 404 if dealer not found, 409 if already deleted.
// Audit log: action=admin.dealer.delete, resource_type=dealer.
func (h *DealerHandler) Delete(w http.ResponseWriter, r *http.Request) {
	actorID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	dealerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid dealer id"}`, http.StatusBadRequest)
		return
	}
	if err := h.svc.SoftDeleteDealer(r.Context(), dealerID); err != nil {
		switch err {
		case service.ErrDealerNotFound:
			http.Error(w, `{"error":"dealer not found"}`, http.StatusNotFound)
		case service.ErrDealerAlreadyDeleted:
			http.Error(w, `{"error":"dealer already deleted"}`, http.StatusConflict)
		default:
			http.Error(w, `{"error":"failed to delete dealer"}`, http.StatusInternalServerError)
		}
		return
	}
	if h.auditLog != nil {
		h.auditLog.RecordAction(r.Context(), repository.AuditLogCreate{
			ActorID:      actorID,
			ActorType:    "admin",
			Action:       "admin.dealer.delete",
			ResourceType: "dealer",
			ResourceID:   dealerID.String(),
			Severity:     "high",
		})
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *DealerHandler) Approve(w http.ResponseWriter, r *http.Request) {
	adminID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	dealerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid dealer id"}`, http.StatusBadRequest)
		return
	}
	var body struct {
		CommissionRatePct float64 `json:"commission_rate_pct"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	dealer, err := h.svc.ApproveDealer(r.Context(), dealerID, adminID, body.CommissionRatePct)
	if err != nil {
		if err == service.ErrDealerNotFound {
			http.Error(w, `{"error":"dealer not found"}`, http.StatusNotFound)
		} else {
			http.Error(w, `{"error":"failed to approve dealer"}`, http.StatusBadRequest)
		}
		return
	}
	respondJSON(w, http.StatusOK, dealer)
}

func (h *DealerHandler) Reject(w http.ResponseWriter, r *http.Request) {
	adminID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	dealerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid dealer id"}`, http.StatusBadRequest)
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Reason == "" {
		http.Error(w, `{"error":"reason required"}`, http.StatusBadRequest)
		return
	}
	if err := h.svc.RejectDealer(r.Context(), dealerID, adminID, body.Reason); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *DealerHandler) Suspend(w http.ResponseWriter, r *http.Request) {
	adminID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	dealerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid dealer id"}`, http.StatusBadRequest)
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if err := h.svc.SuspendDealer(r.Context(), dealerID, adminID, body.Reason); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *DealerHandler) Enable(w http.ResponseWriter, r *http.Request) {
	adminID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	dealerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid dealer id"}`, http.StatusBadRequest)
		return
	}
	if err := h.svc.EnableDealer(r.Context(), dealerID, adminID); err != nil {
		switch err {
		case service.ErrDealerNotFound:
			http.Error(w, `{"error":"dealer not found"}`, http.StatusNotFound)
		default:
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		}
		return
	}
	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *DealerHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	dealer, err := h.svc.GetDealerDashboard(r.Context(), userID)
	if err != nil {
		if err == service.ErrDealerNotFound {
			http.Error(w, `{"error":"not a registered dealer"}`, http.StatusNotFound)
		} else {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		}
		return
	}
	respondJSON(w, http.StatusOK, dealer)
}
