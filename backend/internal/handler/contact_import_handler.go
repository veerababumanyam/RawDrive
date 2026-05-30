package handler

import (
	"errors"
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

	// F-055: cap the contacts CSV upload at 5MB. Without this, r.FormFile
	// falls back to net/http's implicit 32MB ParseMultipartForm default —
	// far larger than a contacts CSV needs — letting authenticated users
	// force excess memory/CPU on parse and create a DoS via concurrent
	// uploads. MaxBytesReader bounds the body before parsing; an over-limit
	// body surfaces as *http.MaxBytesError, which we return as HTTP 413.
	const maxImportBytes = 5 << 20 // 5MB
	r.Body = http.MaxBytesReader(w, r.Body, maxImportBytes)
	if err := r.ParseMultipartForm(maxImportBytes); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			http.Error(w, `{"error":"upload exceeds 5MB limit"}`, http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, `{"error":"could not parse upload"}`, http.StatusBadRequest)
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
