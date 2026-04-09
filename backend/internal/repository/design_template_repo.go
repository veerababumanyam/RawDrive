package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DesignTemplate represents a reusable gallery design template.
type DesignTemplate struct {
	ID          uuid.UUID              `json:"id"`
	WorkspaceID uuid.UUID              `json:"workspace_id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description,omitempty"`
	Config      map[string]interface{} `json:"config"`
	PreviewURL  string                 `json:"preview_url,omitempty"`
	IsDefault   bool                   `json:"is_default"`
	CreatedBy   *uuid.UUID             `json:"created_by,omitempty"`
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
	DeletedAt   *time.Time             `json:"deleted_at,omitempty"`
}

// DesignTemplateRepo handles design template persistence.
type DesignTemplateRepo struct {
	pool *pgxpool.Pool
}

// NewDesignTemplateRepo creates a new DesignTemplateRepo.
func NewDesignTemplateRepo(pool *pgxpool.Pool) *DesignTemplateRepo {
	return &DesignTemplateRepo{pool: pool}
}

// Create inserts a new design template.
func (r *DesignTemplateRepo) Create(ctx context.Context, t *DesignTemplate) error {
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	t.CreatedAt = time.Now()
	t.UpdatedAt = t.CreatedAt

	_, err := r.pool.Exec(ctx,
		`INSERT INTO gallery_design_templates (id, workspace_id, name, description, config, preview_url, is_default, created_by, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		t.ID, t.WorkspaceID, t.Name, t.Description, t.Config, t.PreviewURL, t.IsDefault, t.CreatedBy, t.CreatedAt, t.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("design template create: %w", err)
	}
	return nil
}

// GetByID retrieves a template by ID (excludes soft-deleted).
func (r *DesignTemplateRepo) GetByID(ctx context.Context, id uuid.UUID) (*DesignTemplate, error) {
	t := &DesignTemplate{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, workspace_id, name, description, config, preview_url, is_default, created_by, created_at, updated_at
		 FROM gallery_design_templates WHERE id = $1 AND deleted_at IS NULL`, id,
	).Scan(&t.ID, &t.WorkspaceID, &t.Name, &t.Description, &t.Config, &t.PreviewURL, &t.IsDefault, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("design template get: %w", err)
	}
	return t, nil
}

// ListByWorkspace retrieves all templates for a workspace.
func (r *DesignTemplateRepo) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]DesignTemplate, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, name, description, config, preview_url, is_default, created_by, created_at, updated_at
		 FROM gallery_design_templates WHERE workspace_id = $1 AND deleted_at IS NULL
		 ORDER BY updated_at DESC`, workspaceID,
	)
	if err != nil {
		return nil, fmt.Errorf("design template list: %w", err)
	}
	defer rows.Close()

	var templates []DesignTemplate
	for rows.Next() {
		var t DesignTemplate
		if err := rows.Scan(&t.ID, &t.WorkspaceID, &t.Name, &t.Description, &t.Config, &t.PreviewURL, &t.IsDefault, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		templates = append(templates, t)
	}
	return templates, nil
}

// Update modifies a template's name, description, config, and preview URL.
func (r *DesignTemplateRepo) Update(ctx context.Context, t *DesignTemplate) error {
	t.UpdatedAt = time.Now()
	tag, err := r.pool.Exec(ctx,
		`UPDATE gallery_design_templates SET name=$1, description=$2, config=$3, preview_url=$4, updated_at=$5
		 WHERE id=$6 AND deleted_at IS NULL`,
		t.Name, t.Description, t.Config, t.PreviewURL, t.UpdatedAt, t.ID,
	)
	if err != nil {
		return fmt.Errorf("design template update: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("design template not found: %s", t.ID)
	}
	return nil
}

// SoftDelete marks a template as deleted (30-day recovery window).
func (r *DesignTemplateRepo) SoftDelete(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE gallery_design_templates SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, id,
	)
	if err != nil {
		return fmt.Errorf("design template delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("design template not found: %s", id)
	}
	return nil
}

// Restore recovers a soft-deleted template.
func (r *DesignTemplateRepo) Restore(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE gallery_design_templates SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL`, id,
	)
	if err != nil {
		return fmt.Errorf("design template restore: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("design template not found or not deleted: %s", id)
	}
	return nil
}
