package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

type InvoiceHandler struct {
	repo *repository.InvoiceRepo
}

func NewInvoiceHandler(repo *repository.InvoiceRepo) *InvoiceHandler {
	return &InvoiceHandler{repo: repo}
}

func (h *InvoiceHandler) Create(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	var inv repository.Invoice
	if err := json.NewDecoder(r.Body).Decode(&inv); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	inv.WorkspaceID = workspaceID
	if inv.Status == "" {
		inv.Status = "draft"
	}
	if inv.Currency == "" {
		inv.Currency = "INR"
	}
	if inv.InvoiceType == "" {
		inv.InvoiceType = "service"
	}

	// Generate sequential invoice number
	num, err := h.repo.GetNextInvoiceNumber(r.Context(), workspaceID)
	if err != nil {
		http.Error(w, `{"error":"failed to generate invoice number"}`, http.StatusInternalServerError)
		return
	}
	inv.InvoiceNumber = num

	if err := h.repo.Create(r.Context(), &inv); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, inv)
}

func (h *InvoiceHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	invoices, err := h.repo.List(r.Context(), repository.InvoiceFilter{
		WorkspaceID: workspaceID,
		Status:      r.URL.Query().Get("status"),
		Limit:       50,
	})
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, invoices)
}

func (h *InvoiceHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid invoice id"}`, http.StatusBadRequest)
		return
	}
	inv, err := h.repo.GetByID(r.Context(), workspaceID, id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, inv)
}
