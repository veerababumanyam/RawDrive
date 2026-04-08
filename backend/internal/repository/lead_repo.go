package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Lead represents a CRM lead.
type Lead struct {
	ID                 uuid.UUID  `json:"id"`
	WorkspaceID        uuid.UUID  `json:"workspace_id"`
	Name               string     `json:"name"`
	Phone              *string    `json:"phone"`
	Email              *string    `json:"email"`
	Source             string     `json:"source"`
	Stage              string     `json:"stage"`
	EventType          *string    `json:"event_type"`
	EventDate          *time.Time `json:"event_date"`
	BudgetPaisa        *int64     `json:"budget_paisa"`
	AssignedTo         *uuid.UUID `json:"assigned_to"`
	Notes              *string    `json:"notes"`
	ConvertedContactID *uuid.UUID `json:"converted_contact_id"`
	LostReason         *string    `json:"lost_reason"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// LeadFilter contains filters for listing leads.
type LeadFilter struct {
	WorkspaceID uuid.UUID
	Stage       string
	Source      string
	AssignedTo  *uuid.UUID
	Search      string
	Limit       int
	Cursor      *time.Time
}

// LeadRepo handles lead persistence.
type LeadRepo struct {
	DB *pgxpool.Pool
}

func NewLeadRepo(db *pgxpool.Pool) *LeadRepo {
	return &LeadRepo{DB: db}
}

const leadCols = `id, workspace_id, name, phone, email, source, stage, event_type, event_date, budget_paisa, assigned_to, notes, converted_contact_id, lost_reason, created_at, updated_at`

func scanLead(row pgx.Row) (Lead, error) {
	var l Lead
	err := row.Scan(
		&l.ID, &l.WorkspaceID, &l.Name, &l.Phone, &l.Email,
		&l.Source, &l.Stage, &l.EventType, &l.EventDate,
		&l.BudgetPaisa, &l.AssignedTo, &l.Notes,
		&l.ConvertedContactID, &l.LostReason,
		&l.CreatedAt, &l.UpdatedAt,
	)
	return l, err
}

func (r *LeadRepo) Create(ctx context.Context, l *Lead) error {
	l.ID = uuid.New()
	now := time.Now().UTC()
	l.CreatedAt = now
	l.UpdatedAt = now
	_, err := r.DB.Exec(ctx, `
		INSERT INTO leads (`+leadCols+`)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
		l.ID, l.WorkspaceID, l.Name, l.Phone, l.Email,
		l.Source, l.Stage, l.EventType, l.EventDate,
		l.BudgetPaisa, l.AssignedTo, l.Notes,
		l.ConvertedContactID, l.LostReason,
		l.CreatedAt, l.UpdatedAt,
	)
	return err
}

func (r *LeadRepo) GetByID(ctx context.Context, workspaceID, id uuid.UUID) (Lead, error) {
	row := r.DB.QueryRow(ctx,
		`SELECT `+leadCols+` FROM leads WHERE id = $1 AND workspace_id = $2`, id, workspaceID)
	return scanLead(row)
}

func (r *LeadRepo) List(ctx context.Context, f LeadFilter) ([]Lead, error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 50
	}
	query := `SELECT ` + leadCols + ` FROM leads WHERE workspace_id = $1`
	args := []any{f.WorkspaceID}
	idx := 2
	if f.Stage != "" {
		query += fmt.Sprintf(` AND stage = $%d`, idx)
		args = append(args, f.Stage)
		idx++
	}
	if f.Source != "" {
		query += fmt.Sprintf(` AND source = $%d`, idx)
		args = append(args, f.Source)
		idx++
	}
	if f.AssignedTo != nil {
		query += fmt.Sprintf(` AND assigned_to = $%d`, idx)
		args = append(args, *f.AssignedTo)
		idx++
	}
	if f.Search != "" {
		query += fmt.Sprintf(` AND name ILIKE $%d`, idx)
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
	var out []Lead
	for rows.Next() {
		var l Lead
		if err := rows.Scan(
			&l.ID, &l.WorkspaceID, &l.Name, &l.Phone, &l.Email,
			&l.Source, &l.Stage, &l.EventType, &l.EventDate,
			&l.BudgetPaisa, &l.AssignedTo, &l.Notes,
			&l.ConvertedContactID, &l.LostReason,
			&l.CreatedAt, &l.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (r *LeadRepo) Update(ctx context.Context, l *Lead) error {
	l.UpdatedAt = time.Now().UTC()
	_, err := r.DB.Exec(ctx, `
		UPDATE leads SET name=$1, phone=$2, email=$3, source=$4, stage=$5,
		       event_type=$6, event_date=$7, budget_paisa=$8, assigned_to=$9,
		       notes=$10, converted_contact_id=$11, lost_reason=$12, updated_at=$13
		WHERE id=$14 AND workspace_id=$15`,
		l.Name, l.Phone, l.Email, l.Source, l.Stage,
		l.EventType, l.EventDate, l.BudgetPaisa, l.AssignedTo,
		l.Notes, l.ConvertedContactID, l.LostReason, l.UpdatedAt,
		l.ID, l.WorkspaceID,
	)
	return err
}

func (r *LeadRepo) UpdateStage(ctx context.Context, workspaceID, id uuid.UUID, stage string) error {
	_, err := r.DB.Exec(ctx, `
		UPDATE leads SET stage = $1, updated_at = $2 WHERE id = $3 AND workspace_id = $4`,
		stage, time.Now().UTC(), id, workspaceID)
	return err
}

func (r *LeadRepo) AssignTo(ctx context.Context, workspaceID, id, userID uuid.UUID) error {
	_, err := r.DB.Exec(ctx, `
		UPDATE leads SET assigned_to = $1, updated_at = $2 WHERE id = $3 AND workspace_id = $4`,
		userID, time.Now().UTC(), id, workspaceID)
	return err
}
