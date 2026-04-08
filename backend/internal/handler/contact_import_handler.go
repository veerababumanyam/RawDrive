package handler

import (
	"net/http"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// ImportCSV handles POST /api/v1/crm/contacts/import
func (h *ContactHandler) ImportCSV(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, `{"error":"file required (multipart form field 'file')"}`, http.StatusBadRequest)
		return
	}
	defer file.Close()

	result, err := service.ImportContactsCSV(r.Context(), h.repo, workspaceID, file)
	if err != nil {
		http.Error(w, `{"error":"import failed: `+err.Error()+`"}`, http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

// ensure ContactHandler has the repo field (it does, from contact_handler.go)
var _ *repository.ContactRepo
