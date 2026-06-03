package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

type ContactHandler struct {
	repo *repository.ContactRepo
}

func NewContactHandler(repo *repository.ContactRepo) *ContactHandler {
	return &ContactHandler{repo: repo}
}

func (h *ContactHandler) Create(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	var c repository.Contact
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	c.WorkspaceID = workspaceID
	if c.ContactType == "" {
		c.ContactType = "client"
	}
	if err := h.repo.Create(r.Context(), &c); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, c)
}

func (h *ContactHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	contacts, err := h.repo.List(r.Context(), repository.ContactFilter{
		WorkspaceID: workspaceID,
		ContactType: r.URL.Query().Get("type"),
		Search:      r.URL.Query().Get("search"),
		Limit:       50,
	})
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, contacts)
}

func (h *ContactHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid contact id"}`, http.StatusBadRequest)
		return
	}
	contact, err := h.repo.GetByID(r.Context(), workspaceID, id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, contact)
}

func (h *ContactHandler) Update(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid contact id"}`, http.StatusBadRequest)
		return
	}
	var c repository.Contact
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	c.ID = id
	c.WorkspaceID = workspaceID
	if err := h.repo.Update(r.Context(), &c); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, c)
}

func (h *ContactHandler) Merge(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	var body struct {
		TargetID uuid.UUID `json:"target_id"`
		SourceID uuid.UUID `json:"source_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if err := h.repo.MergeContacts(r.Context(), workspaceID, body.TargetID, body.SourceID); err != nil {
		http.Error(w, `{"error":"merge failed"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "merged"})
}
