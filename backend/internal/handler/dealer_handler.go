package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

type DealerHandler struct {
	svc *service.DealerService
}

func NewDealerHandler(svc *service.DealerService) *DealerHandler {
	return &DealerHandler{svc: svc}
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
	dealer, err := h.svc.RegisterDealer(r.Context(), userID, req)
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
	status := r.URL.Query().Get("status")
	filter := repository.DealerFilter{
		Status: status,
		Limit:  20,
	}
	dealers, err := h.svc.ListDealers(r.Context(), filter)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, dealers)
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
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
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
	json.NewDecoder(r.Body).Decode(&body)
	if err := h.svc.SuspendDealer(r.Context(), dealerID, adminID, body.Reason); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
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
