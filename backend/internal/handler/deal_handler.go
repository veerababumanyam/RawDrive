package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

type DealHandler struct {
	repo        *repository.DealRepo
	projectRepo *repository.StudioProjectRepo
}

func NewDealHandler(repo *repository.DealRepo) *DealHandler {
	return &DealHandler{repo: repo}
}

func (h *DealHandler) WithProjectRepo(repo *repository.StudioProjectRepo) *DealHandler {
	h.projectRepo = repo
	return h
}

func (h *DealHandler) Create(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	var d repository.Deal
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	d.WorkspaceID = workspaceID
	// Normalize friendly stage names (used by the UI) to the
	// CHECK-constraint-allowed set on deals.stage:
	// {proposal, negotiation, confirmed, in_progress, completed,
	// cancelled}. Enables the UI to keep human terms like
	// "booked" / "delivered" / "lost" without a risky migration.
	switch d.Stage {
	case "", "inquiry":
		d.Stage = "proposal"
	case "booked":
		d.Stage = "confirmed"
	case "delivered":
		d.Stage = "completed"
	case "lost":
		d.Stage = "cancelled"
	case "proposal", "negotiation", "confirmed", "in_progress", "completed", "cancelled":
		// pass through — already valid
	}
	if err := h.repo.Create(r.Context(), &d); err != nil {
		// Verbose error so UAT + callers can see the actual cause
		// (FK to contact_id, CHECK on stage, etc.) instead of the
		// old opaque "internal error" body.
		http.Error(w, fmt.Sprintf(`{"error":"create deal failed: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	if h.projectRepo != nil {
		if err := h.projectRepo.CreateFromDeal(r.Context(), d); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"create project compatibility record failed: %s"}`, err.Error()), http.StatusInternalServerError)
			return
		}
	}
	respondJSON(w, http.StatusCreated, d)
}

func (h *DealHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	deals, err := h.repo.List(r.Context(), repository.DealFilter{
		WorkspaceID: workspaceID,
		Stage:       r.URL.Query().Get("stage"),
		Search:      r.URL.Query().Get("search"),
		Limit:       50,
	})
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, deals)
}

func (h *DealHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid deal id"}`, http.StatusBadRequest)
		return
	}
	deal, err := h.repo.GetByID(r.Context(), workspaceID, id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, deal)
}

func (h *DealHandler) Update(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid deal id"}`, http.StatusBadRequest)
		return
	}
	var d repository.Deal
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	d.ID = id
	d.WorkspaceID = workspaceID
	if err := h.repo.Update(r.Context(), &d); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, d)
}

// Follow-up handlers

func (h *DealHandler) CreateFollowUp(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	var f repository.FollowUp
	if err := json.NewDecoder(r.Body).Decode(&f); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	f.WorkspaceID = workspaceID
	if f.Status == "" {
		f.Status = "pending"
	}
	if f.Type == "" {
		f.Type = "call"
	}
	if err := h.repo.CreateFollowUp(r.Context(), &f); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, f)
}

func (h *DealHandler) ListFollowUps(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	followUps, err := h.repo.ListFollowUps(r.Context(), workspaceID, nil, 50)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, followUps)
}

func (h *DealHandler) CompleteFollowUp(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid follow-up id"}`, http.StatusBadRequest)
		return
	}
	if err := h.repo.CompleteFollowUp(r.Context(), workspaceID, id); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "completed"})
}
