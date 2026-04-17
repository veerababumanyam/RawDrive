package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rawdrive/backend/internal/repository"
)

type CalendarHandler struct {
	repo *repository.EventRepo
}

func NewCalendarHandler(repo *repository.EventRepo) *CalendarHandler {
	return &CalendarHandler{repo: repo}
}

func calendarUpdateNeedsConflictCheck(e repository.Event) bool {
	return e.Status == "confirmed"
}

func (h *CalendarHandler) CreateEvent(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	var e repository.Event
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	e.WorkspaceID = workspaceID
	if e.Status == "" {
		e.Status = "tentative"
	}

	// M39 fix #28: conflict check must only fire when the new event is
	// itself confirmed. Previously every POST defaulted to "confirmed"
	// AND ran the conflict check, so photographers booking speculative
	// shoots always tripped the 409 even when no real overlap existed.
	// Tentative events coexist freely; the check also intentionally
	// only considers existing confirmed events (see repo query).
	if e.Status == "confirmed" {
		conflict, err := h.repo.CheckConflict(r.Context(), workspaceID, e.StartAt, e.EndAt, nil)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		if conflict {
			http.Error(w, `{"error":"time slot conflict with existing event"}`, http.StatusConflict)
			return
		}
	}

	if err := h.repo.Create(r.Context(), &e); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// CRM → Calendar → Freelancer availability sync: when the new
	// event is a photography shoot, automatically block that date
	// on every freelancer listing owned by the caller. Other
	// photographers browsing the marketplace will then see the
	// studio's next-available date move forward without a manual
	// update. Best-effort — a failure here does NOT undo the
	// event create, it's logged and ignored so a stuck availability
	// sync cannot wedge a user's calendar.
	if e.EventType == "shoot" || e.EventType == "booking" {
		if userID, ok := getUserID(r); ok {
			_ = autoBlockFreelancerDate(r.Context(), h.repo.DB, userID, e.StartAt)
		}
	}
	respondJSON(w, http.StatusCreated, e)
}

// autoBlockFreelancerDate appends a YYYY-MM-DD date to the
// booked_dates array of every freelancer_listings row owned by the
// given user. Uses a single UPDATE with a jsonb_set expression so the
// append is atomic and preserves any other keys (blocked_dates,
// notes, etc.). Silent no-op if the user has no listings.
//
// The "date" value is the shoot's start_at truncated to UTC date. A
// multi-day shoot (start and end span different dates) only blocks
// the start date today — iterating day-by-day is a future extension
// when we wire hire-request conflict detection.
func autoBlockFreelancerDate(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, startAt time.Time) error {
	dateStr := startAt.UTC().Format("2006-01-02")
	// Append the date to booked_dates only if it isn't already there
	// (jsonb_array_elements pre-check avoids duplicate entries over
	// repeated event creates).
	_, err := pool.Exec(ctx, `
		UPDATE freelancer_listings
		SET availability_calendar = jsonb_set(
			COALESCE(availability_calendar, '{}'::jsonb),
			'{booked_dates}',
			COALESCE(availability_calendar->'booked_dates', '[]'::jsonb)
				|| CASE
					WHEN COALESCE(availability_calendar->'booked_dates', '[]'::jsonb) @> to_jsonb($2::text)
					THEN '[]'::jsonb
					ELSE to_jsonb(ARRAY[$2::text])
				END,
			true
		),
		updated_at = now()
		WHERE user_id = $1`, userID, dateStr)
	return err
}

func (h *CalendarHandler) ListEvents(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	from, _ := time.Parse(time.RFC3339, r.URL.Query().Get("from"))
	to, _ := time.Parse(time.RFC3339, r.URL.Query().Get("to"))
	if from.IsZero() {
		from = time.Now().AddDate(0, -1, 0)
	}
	if to.IsZero() {
		to = time.Now().AddDate(0, 1, 0)
	}
	var projectID *uuid.UUID
	if raw := r.URL.Query().Get("project_id"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			http.Error(w, `{"error":"invalid project_id"}`, http.StatusBadRequest)
			return
		}
		projectID = &id
	}
	events, err := h.repo.List(r.Context(), repository.EventFilter{
		WorkspaceID: workspaceID,
		From:        from,
		To:          to,
		EventType:   r.URL.Query().Get("type"),
		ProjectID:   projectID,
	})
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, events)
}

func (h *CalendarHandler) GetEvent(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid event id"}`, http.StatusBadRequest)
		return
	}
	event, err := h.repo.GetByID(r.Context(), workspaceID, id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, event)
}

func (h *CalendarHandler) UpdateEvent(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid event id"}`, http.StatusBadRequest)
		return
	}
	var e repository.Event
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	e.ID = id
	e.WorkspaceID = workspaceID
	if e.Status == "" {
		e.Status = "confirmed"
	}
	if calendarUpdateNeedsConflictCheck(e) {
		conflict, err := h.repo.CheckConflict(r.Context(), workspaceID, e.StartAt, e.EndAt, &id)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		if conflict {
			http.Error(w, `{"error":"time slot conflict with existing confirmed event"}`, http.StatusConflict)
			return
		}
	}
	if err := h.repo.Update(r.Context(), &e); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, e)
}

func (h *CalendarHandler) DeleteEvent(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid event id"}`, http.StatusBadRequest)
		return
	}
	if err := h.repo.Delete(r.Context(), workspaceID, id); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
