package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Contact represents a client/vendor record.
type Contact struct {
	ID               uuid.UUID  `json:"id"`
	WorkspaceID      uuid.UUID  `json:"workspace_id"`
	UserID           *uuid.UUID `json:"user_id"`
	Name             string     `json:"name"`
	Phone            *string    `json:"phone"`
	Email            *string    `json:"email"`
	ContactType      string     `json:"contact_type"`
	Company          *string    `json:"company"`
	Address          *string    `json:"address"`
	Tags             []string   `json:"tags"`
	Notes            *string    `json:"notes"`
	TotalRevenuePaisa int64     `json:"total_revenue_paisa"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type ContactFilter struct {
	WorkspaceID uuid.UUID
	ContactType string
	Search      string
	Limit       int
	Cursor      *time.Time
}

type ContactRepo struct {
	DB *pgxpool.Pool
}

func NewContactRepo(db *pgxpool.Pool) *ContactRepo {
	return &ContactRepo{DB: db}
}

const contactCols = `id, workspace_id, user_id, name, phone, email, contact_type, company, address, tags, notes, total_revenue_paisa, created_at, updated_at`

func scanContact(row pgx.Row) (Contact, error) {
	var c Contact
	err := row.Scan(
		&c.ID, &c.WorkspaceID, &c.UserID, &c.Name, &c.Phone, &c.Email,
		&c.ContactType, &c.Company, &c.Address, &c.Tags, &c.Notes,
		&c.TotalRevenuePaisa, &c.CreatedAt, &c.UpdatedAt,
	)
	return c, err
}

func (r *ContactRepo) Create(ctx context.Context, c *Contact) error {
	c.ID = uuid.New()
	now := time.Now().UTC()
	c.CreatedAt = now
	c.UpdatedAt = now
	if c.Tags == nil {
		c.Tags = []string{}
	}
	_, err := r.DB.Exec(ctx, `
		INSERT INTO contacts (`+contactCols+`)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		c.ID, c.WorkspaceID, c.UserID, c.Name, c.Phone, c.Email,
		c.ContactType, c.Company, c.Address, c.Tags, c.Notes,
		c.TotalRevenuePaisa, c.CreatedAt, c.UpdatedAt,
	)
	return err
}

func (r *ContactRepo) GetByID(ctx context.Context, workspaceID, id uuid.UUID) (Contact, error) {
	row := r.DB.QueryRow(ctx,
		`SELECT `+contactCols+` FROM contacts WHERE id = $1 AND workspace_id = $2`, id, workspaceID)
	return scanContact(row)
}

func (r *ContactRepo) List(ctx context.Context, f ContactFilter) ([]Contact, error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 50
	}
	query := `SELECT ` + contactCols + ` FROM contacts WHERE workspace_id = $1`
	args := []any{f.WorkspaceID}
	idx := 2
	if f.ContactType != "" {
		query += fmt.Sprintf(` AND contact_type = $%d`, idx)
		args = append(args, f.ContactType)
		idx++
	}
	if f.Search != "" {
		query += fmt.Sprintf(` AND (name ILIKE $%d OR email ILIKE $%d OR phone ILIKE $%d)`, idx, idx, idx)
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
	var out []Contact
	for rows.Next() {
		var c Contact
		if err := rows.Scan(
			&c.ID, &c.WorkspaceID, &c.UserID, &c.Name, &c.Phone, &c.Email,
			&c.ContactType, &c.Company, &c.Address, &c.Tags, &c.Notes,
			&c.TotalRevenuePaisa, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *ContactRepo) Update(ctx context.Context, c *Contact) error {
	c.UpdatedAt = time.Now().UTC()
	if c.Tags == nil {
		c.Tags = []string{}
	}
	_, err := r.DB.Exec(ctx, `
		UPDATE contacts SET name=$1, phone=$2, email=$3, contact_type=$4,
		       company=$5, address=$6, tags=$7, notes=$8, updated_at=$9
		WHERE id=$10 AND workspace_id=$11`,
		c.Name, c.Phone, c.Email, c.ContactType,
		c.Company, c.Address, c.Tags, c.Notes, c.UpdatedAt,
		c.ID, c.WorkspaceID,
	)
	return err
}

// MergeContacts combines source into target within a transaction.
func (r *ContactRepo) MergeContacts(ctx context.Context, workspaceID, targetID, sourceID uuid.UUID) error {
	tx, err := r.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	now := time.Now().UTC()

	// Reassign deals from source to target
	_, err = tx.Exec(ctx, `UPDATE deals SET contact_id=$1, updated_at=$2 WHERE contact_id=$3 AND workspace_id=$4`,
		targetID, now, sourceID, workspaceID)
	if err != nil {
		return fmt.Errorf("reassign deals: %w", err)
	}

	// Reassign follow-ups
	_, err = tx.Exec(ctx, `UPDATE follow_ups SET contact_id=$1, updated_at=$2 WHERE contact_id=$3 AND workspace_id=$4`,
		targetID, now, sourceID, workspaceID)
	if err != nil {
		return fmt.Errorf("reassign follow-ups: %w", err)
	}

	// Reassign contracts
	_, err = tx.Exec(ctx, `UPDATE contracts SET contact_id=$1, updated_at=$2 WHERE contact_id=$3 AND workspace_id=$4`,
		targetID, now, sourceID, workspaceID)
	if err != nil {
		return fmt.Errorf("reassign contracts: %w", err)
	}

	// Reassign invoices
	_, err = tx.Exec(ctx, `UPDATE invoices SET contact_id=$1, updated_at=$2 WHERE contact_id=$3 AND workspace_id=$4`,
		targetID, now, sourceID, workspaceID)
	if err != nil {
		return fmt.Errorf("reassign invoices: %w", err)
	}

	// Delete source contact
	_, err = tx.Exec(ctx, `DELETE FROM contacts WHERE id=$1 AND workspace_id=$2`, sourceID, workspaceID)
	if err != nil {
		return fmt.Errorf("delete source: %w", err)
	}

	return tx.Commit(ctx)
}
