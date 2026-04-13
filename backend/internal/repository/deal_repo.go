package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Deal represents a CRM deal/booking.
type Deal struct {
	ID           uuid.UUID  `json:"id"`
	WorkspaceID  uuid.UUID  `json:"workspace_id"`
	ContactID    uuid.UUID  `json:"contact_id"`
	Title        string     `json:"title"`
	Stage        string     `json:"stage"`
	AmountPaisa  int64      `json:"amount_paisa"`
	AdvancePaisa int64      `json:"advance_paisa"`
	EventType    *string    `json:"event_type"`
	EventDate    *time.Time `json:"event_date"`
	Venue        *string    `json:"venue"`
	Notes        *string    `json:"notes"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type DealFilter struct {
	WorkspaceID uuid.UUID
	ContactID   *uuid.UUID
	Stage       string
	Search      string
	Limit       int
	Cursor      *time.Time
}

// FollowUp represents a CRM follow-up reminder.
type FollowUp struct {
	ID          uuid.UUID  `json:"id"`
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	LeadID      *uuid.UUID `json:"lead_id"`
	ContactID   *uuid.UUID `json:"contact_id"`
	DealID      *uuid.UUID `json:"deal_id"`
	ProjectID   *uuid.UUID `json:"project_id,omitempty"`
	AssignedTo  *uuid.UUID `json:"assigned_to"`
	Type        string     `json:"type"`
	DueAt       time.Time  `json:"due_at"`
	Notes       *string    `json:"notes"`
	Status      string     `json:"status"`
	CompletedAt *time.Time `json:"completed_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type DealRepo struct {
	DB *pgxpool.Pool
}

func NewDealRepo(db *pgxpool.Pool) *DealRepo {
	return &DealRepo{DB: db}
}

const dealCols = `id, workspace_id, contact_id, title, stage, amount_paisa, advance_paisa, event_type, event_date, venue, notes, created_at, updated_at`
const followUpCols = `id, workspace_id, lead_id, contact_id, deal_id, project_id, assigned_to, type, due_at, notes, status, completed_at, created_at, updated_at`

func scanDeal(row pgx.Row) (Deal, error) {
	var d Deal
	err := row.Scan(&d.ID, &d.WorkspaceID, &d.ContactID, &d.Title, &d.Stage,
		&d.AmountPaisa, &d.AdvancePaisa, &d.EventType, &d.EventDate, &d.Venue, &d.Notes,
		&d.CreatedAt, &d.UpdatedAt)
	return d, err
}

func (r *DealRepo) Create(ctx context.Context, d *Deal) error {
	d.ID = uuid.New()
	now := time.Now().UTC()
	d.CreatedAt = now
	d.UpdatedAt = now
	_, err := r.DB.Exec(ctx, `
		INSERT INTO deals (`+dealCols+`)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		d.ID, d.WorkspaceID, d.ContactID, d.Title, d.Stage,
		d.AmountPaisa, d.AdvancePaisa, d.EventType, d.EventDate, d.Venue, d.Notes,
		d.CreatedAt, d.UpdatedAt,
	)
	return err
}

func (r *DealRepo) GetByID(ctx context.Context, workspaceID, id uuid.UUID) (Deal, error) {
	row := r.DB.QueryRow(ctx,
		`SELECT `+dealCols+` FROM deals WHERE id=$1 AND workspace_id=$2`, id, workspaceID)
	return scanDeal(row)
}

func (r *DealRepo) List(ctx context.Context, f DealFilter) ([]Deal, error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 50
	}
	query := `SELECT ` + dealCols + ` FROM deals WHERE workspace_id = $1`
	args := []any{f.WorkspaceID}
	idx := 2
	if f.ContactID != nil {
		query += fmt.Sprintf(` AND contact_id = $%d`, idx)
		args = append(args, *f.ContactID)
		idx++
	}
	if f.Stage != "" {
		query += fmt.Sprintf(` AND stage = $%d`, idx)
		args = append(args, f.Stage)
		idx++
	}
	if f.Search != "" {
		query += fmt.Sprintf(` AND title ILIKE $%d`, idx)
		args = append(args, "%"+f.Search+"%")
		idx++
	}
	if f.Cursor != nil {
		query += fmt.Sprintf(` AND created_at < $%d`, idx)
		args = append(args, *f.Cursor)
		idx++
	}
	query += fmt.Sprintf(` ORDER BY created_at DESC LIMIT $%d`, idx)
	args = append(args, f.Limit)

	rows, err := r.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Deal
	for rows.Next() {
		var d Deal
		if err := rows.Scan(&d.ID, &d.WorkspaceID, &d.ContactID, &d.Title, &d.Stage,
			&d.AmountPaisa, &d.AdvancePaisa, &d.EventType, &d.EventDate, &d.Venue, &d.Notes,
			&d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *DealRepo) Update(ctx context.Context, d *Deal) error {
	d.UpdatedAt = time.Now().UTC()
	_, err := r.DB.Exec(ctx, `
		UPDATE deals SET contact_id=$1, title=$2, stage=$3, amount_paisa=$4, advance_paisa=$5,
		       event_type=$6, event_date=$7, venue=$8, notes=$9, updated_at=$10
		WHERE id=$11 AND workspace_id=$12`,
		d.ContactID, d.Title, d.Stage, d.AmountPaisa, d.AdvancePaisa,
		d.EventType, d.EventDate, d.Venue, d.Notes, d.UpdatedAt,
		d.ID, d.WorkspaceID,
	)
	return err
}

func (r *DealRepo) UpdateStage(ctx context.Context, workspaceID, id uuid.UUID, stage string) error {
	_, err := r.DB.Exec(ctx, `
		UPDATE deals SET stage=$1, updated_at=$2 WHERE id=$3 AND workspace_id=$4`,
		stage, time.Now().UTC(), id, workspaceID)
	return err
}

// Follow-up methods

func (r *DealRepo) CreateFollowUp(ctx context.Context, f *FollowUp) error {
	f.ID = uuid.New()
	now := time.Now().UTC()
	f.CreatedAt = now
	f.UpdatedAt = now
	_, err := r.DB.Exec(ctx, `
		INSERT INTO follow_ups (`+followUpCols+`)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		f.ID, f.WorkspaceID, f.LeadID, f.ContactID, f.DealID, f.ProjectID,
		f.AssignedTo, f.Type, f.DueAt, f.Notes, f.Status, f.CompletedAt,
		f.CreatedAt, f.UpdatedAt,
	)
	return err
}

func (r *DealRepo) ListFollowUps(ctx context.Context, workspaceID uuid.UUID, dealID *uuid.UUID, limit int) ([]FollowUp, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	query := `SELECT ` + followUpCols + ` FROM follow_ups WHERE workspace_id = $1`
	args := []any{workspaceID}
	idx := 2
	if dealID != nil {
		query += fmt.Sprintf(` AND deal_id = $%d`, idx)
		args = append(args, *dealID)
		idx++
	}
	query += fmt.Sprintf(` ORDER BY due_at ASC LIMIT $%d`, idx)
	args = append(args, limit)

	rows, err := r.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []FollowUp
	for rows.Next() {
		var f FollowUp
		if err := rows.Scan(&f.ID, &f.WorkspaceID, &f.LeadID, &f.ContactID, &f.DealID, &f.ProjectID,
			&f.AssignedTo, &f.Type, &f.DueAt, &f.Notes, &f.Status, &f.CompletedAt,
			&f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (r *DealRepo) CompleteFollowUp(ctx context.Context, workspaceID, id uuid.UUID) error {
	now := time.Now().UTC()
	_, err := r.DB.Exec(ctx, `
		UPDATE follow_ups SET status='completed', completed_at=$1, updated_at=$1
		WHERE id=$2 AND workspace_id=$3 AND status='pending'`,
		now, id, workspaceID)
	return err
}

func (r *DealRepo) ListOverdue(ctx context.Context, workspaceID uuid.UUID, limit int) ([]FollowUp, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := r.DB.Query(ctx, `
		SELECT `+followUpCols+` FROM follow_ups
		WHERE workspace_id = $1 AND status = 'pending' AND due_at < $2
		ORDER BY due_at ASC LIMIT $3`,
		workspaceID, time.Now().UTC(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []FollowUp
	for rows.Next() {
		var f FollowUp
		if err := rows.Scan(&f.ID, &f.WorkspaceID, &f.LeadID, &f.ContactID, &f.DealID, &f.ProjectID,
			&f.AssignedTo, &f.Type, &f.DueAt, &f.Notes, &f.Status, &f.CompletedAt,
			&f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}
