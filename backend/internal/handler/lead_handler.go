package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

type LeadHandler struct {
	repo       *repository.LeadRepo
	dispatcher *NotificationDispatcher
}

func NewLeadHandler(repo *repository.LeadRepo) *LeadHandler {
	return &LeadHandler{repo: repo}
}

// WithNotificationDispatcher wires the notification fan-out for lead events.
// Calling this with a nil dispatcher disables notifications, which is fine
// for tests and for deployments that have not yet configured delivery.
func (h *LeadHandler) WithNotificationDispatcher(d *NotificationDispatcher) *LeadHandler {
	h.dispatcher = d
	return h
}

func (h *LeadHandler) Create(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	var lead repository.Lead
	if err := json.NewDecoder(r.Body).Decode(&lead); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	lead.WorkspaceID = workspaceID
	if lead.Stage == "" {
		lead.Stage = "new"
	}
	if lead.Source == "" {
		lead.Source = "website"
	}
	if err := h.repo.Create(r.Context(), &lead); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	// Best-effort notification fan-out to the workspace owner. Safe on nil
	// dispatcher; never fails the caller.
	h.dispatcher.Notify(r.Context(), workspaceID,
		"bookings",
		"New lead captured",
		"A new lead ("+lead.Name+") has been added to your pipeline.",
		"/crm/leads/"+lead.ID.String(),
	)
	respondJSON(w, http.StatusCreated, lead)
}

func (h *LeadHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	leads, err := h.repo.List(r.Context(), repository.LeadFilter{
		WorkspaceID: workspaceID,
		Stage:       r.URL.Query().Get("stage"),
		Source:      r.URL.Query().Get("source"),
		Search:      r.URL.Query().Get("search"),
		Limit:       50,
	})
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, leads)
}

func (h *LeadHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid lead id"}`, http.StatusBadRequest)
		return
	}
	lead, err := h.repo.GetByID(r.Context(), workspaceID, id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, lead)
}

func (h *LeadHandler) Update(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid lead id"}`, http.StatusBadRequest)
		return
	}
	var lead repository.Lead
	if err := json.NewDecoder(r.Body).Decode(&lead); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	lead.ID = id
	lead.WorkspaceID = workspaceID
	if err := h.repo.Update(r.Context(), &lead); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, lead)
}

func (h *LeadHandler) UpdateStage(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid lead id"}`, http.StatusBadRequest)
		return
	}
	var body struct {
		Stage string `json:"stage"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Stage == "" {
		http.Error(w, `{"error":"stage required"}`, http.StatusBadRequest)
		return
	}
	if err := h.repo.UpdateStage(r.Context(), workspaceID, id, body.Stage); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
