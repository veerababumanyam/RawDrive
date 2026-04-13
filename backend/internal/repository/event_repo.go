package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Event represents a calendar event.
type Event struct {
	ID              uuid.UUID  `json:"id"`
	WorkspaceID     uuid.UUID  `json:"workspace_id"`
	Title           string     `json:"title"`
	EventType       string     `json:"event_type"`
	StartAt         time.Time  `json:"start_at"`
	EndAt           time.Time  `json:"end_at"`
	AllDay          bool       `json:"all_day"`
	Location        *string    `json:"location"`
	ContactID       *uuid.UUID `json:"contact_id"`
	DealID          *uuid.UUID `json:"deal_id"`
	ProjectID       *uuid.UUID `json:"project_id"`
	Status          string     `json:"status"`
	RecurrenceRule  *string    `json:"recurrence_rule"`
	BufferBeforeMin int        `json:"buffer_before_min"`
	BufferAfterMin  int        `json:"buffer_after_min"`
	Color           *string    `json:"color"`
	Notes           *string    `json:"notes"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type EventFilter struct {
	WorkspaceID uuid.UUID
	From        time.Time
	To          time.Time
	EventType   string
	DealID      *uuid.UUID
	ProjectID   *uuid.UUID
	Status      string
}

type EventRepo struct {
	DB *pgxpool.Pool
}

func NewEventRepo(db *pgxpool.Pool) *EventRepo {
	return &EventRepo{DB: db}
}

const eventCols = `id, workspace_id, title, event_type, start_at, end_at, all_day, location, contact_id, deal_id, project_id, status, recurrence_rule, buffer_before_min, buffer_after_min, color, notes, created_at, updated_at`

func scanEvent(row pgx.Row) (Event, error) {
	var e Event
	err := row.Scan(&e.ID, &e.WorkspaceID, &e.Title, &e.EventType,
		&e.StartAt, &e.EndAt, &e.AllDay, &e.Location,
		&e.ContactID, &e.DealID, &e.ProjectID, &e.Status, &e.RecurrenceRule,
		&e.BufferBeforeMin, &e.BufferAfterMin, &e.Color, &e.Notes,
		&e.CreatedAt, &e.UpdatedAt)
	return e, err
}

func (r *EventRepo) Create(ctx context.Context, e *Event) error {
	e.ID = uuid.New()
	now := time.Now().UTC()
	e.CreatedAt = now
	e.UpdatedAt = now
	_, err := r.DB.Exec(ctx, `
		INSERT INTO events (`+eventCols+`)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
		e.ID, e.WorkspaceID, e.Title, e.EventType,
		e.StartAt, e.EndAt, e.AllDay, e.Location,
		e.ContactID, e.DealID, e.ProjectID, e.Status, e.RecurrenceRule,
		e.BufferBeforeMin, e.BufferAfterMin, e.Color, e.Notes,
		e.CreatedAt, e.UpdatedAt,
	)
	return err
}

func (r *EventRepo) GetByID(ctx context.Context, workspaceID, id uuid.UUID) (Event, error) {
	row := r.DB.QueryRow(ctx,
		`SELECT `+eventCols+` FROM events WHERE id=$1 AND workspace_id=$2`, id, workspaceID)
	return scanEvent(row)
}

func (r *EventRepo) List(ctx context.Context, f EventFilter) ([]Event, error) {
	query := `SELECT ` + eventCols + ` FROM events WHERE workspace_id = $1 AND start_at < $2 AND end_at > $3`
	args := []any{f.WorkspaceID, f.To, f.From}
	idx := 4
	if f.EventType != "" {
		query += fmt.Sprintf(` AND event_type = $%d`, idx)
		args = append(args, f.EventType)
		idx++
	}
	if f.DealID != nil {
		query += fmt.Sprintf(` AND deal_id = $%d`, idx)
		args = append(args, *f.DealID)
		idx++
	}
	if f.ProjectID != nil {
		query += fmt.Sprintf(` AND project_id = $%d`, idx)
		args = append(args, *f.ProjectID)
		idx++
	}
	if f.Status != "" {
		query += fmt.Sprintf(` AND status = $%d`, idx)
		args = append(args, f.Status)
		idx++
	}
	query += ` ORDER BY start_at ASC`

	rows, err := r.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Event
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.WorkspaceID, &e.Title, &e.EventType,
			&e.StartAt, &e.EndAt, &e.AllDay, &e.Location,
			&e.ContactID, &e.DealID, &e.ProjectID, &e.Status, &e.RecurrenceRule,
			&e.BufferBeforeMin, &e.BufferAfterMin, &e.Color, &e.Notes,
			&e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *EventRepo) Update(ctx context.Context, e *Event) error {
	e.UpdatedAt = time.Now().UTC()
	_, err := r.DB.Exec(ctx, `
		UPDATE events SET title=$1, event_type=$2, start_at=$3, end_at=$4, all_day=$5,
		       location=$6, contact_id=$7, deal_id=$8, project_id=$9, status=$10, recurrence_rule=$11,
		       buffer_before_min=$12, buffer_after_min=$13, color=$14, notes=$15, updated_at=$16
		WHERE id=$17 AND workspace_id=$18`,
		e.Title, e.EventType, e.StartAt, e.EndAt, e.AllDay,
		e.Location, e.ContactID, e.DealID, e.ProjectID, e.Status, e.RecurrenceRule,
		e.BufferBeforeMin, e.BufferAfterMin, e.Color, e.Notes, e.UpdatedAt,
		e.ID, e.WorkspaceID,
	)
	return err
}

func (r *EventRepo) Delete(ctx context.Context, workspaceID, id uuid.UUID) error {
	_, err := r.DB.Exec(ctx, `DELETE FROM events WHERE id=$1 AND workspace_id=$2`, id, workspaceID)
	return err
}

// CheckConflict returns true if any confirmed events overlap the given time range.
func (r *EventRepo) CheckConflict(ctx context.Context, workspaceID uuid.UUID, startAt, endAt time.Time, excludeID *uuid.UUID) (bool, error) {
	query := `
		SELECT EXISTS(
			SELECT 1 FROM events
			WHERE workspace_id = $1
			  AND status = 'confirmed'
			  AND start_at < $3
			  AND end_at > $2
		)`
	args := []any{workspaceID, startAt, endAt}
	if excludeID != nil {
		query = `
			SELECT EXISTS(
				SELECT 1 FROM events
				WHERE workspace_id = $1
				  AND status = 'confirmed'
				  AND id != $4
				  AND start_at < $3
				  AND end_at > $2
			)`
		args = append(args, *excludeID)
	}
	var exists bool
	err := r.DB.QueryRow(ctx, query, args...).Scan(&exists)
	return exists, err
}
