package handler

import (
	"net/http"
	"time"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// ExportICS handles GET /api/v1/calendar/export.ics
func (h *CalendarHandler) ExportICS(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}

	// Export next 365 days of events
	from := time.Now().AddDate(0, -1, 0)
	to := time.Now().AddDate(1, 0, 0)

	events, err := h.repo.List(r.Context(), repository.EventFilter{
		WorkspaceID: workspaceID,
		From:        from,
		To:          to,
	})
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	ics := service.GenerateICS(events, "RawDrive Calendar")

	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=rawdrive-calendar.ics")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(ics))
}
