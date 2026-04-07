package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Gallery represents a photo gallery.
type Gallery struct {
	ID              uuid.UUID              `json:"id"`
	WorkspaceID     uuid.UUID              `json:"workspace_id"`
	Title           string                 `json:"title"`
	Slug            string                 `json:"slug"`
	Description     string                 `json:"description"`
	CoverAssetID    *uuid.UUID             `json:"cover_asset_id,omitempty"`
	GalleryType     string                 `json:"gallery_type"`
	Settings        map[string]interface{} `json:"settings"`
	PasswordHash    *string                `json:"-"`
	WatermarkConfig map[string]interface{} `json:"watermark_config"`
	IsPublished     bool                   `json:"is_published"`
	MaxSelections   int                    `json:"max_selections"`
	Status          string                 `json:"status"`
	CreatedBy       *uuid.UUID             `json:"created_by,omitempty"`
	CreatedAt       time.Time              `json:"created_at"`
	UpdatedAt       time.Time              `json:"updated_at"`
	DeletedAt       *time.Time             `json:"deleted_at,omitempty"`
}

// GalleryFilter contains filters for listing galleries.
type GalleryFilter struct {
	WorkspaceID uuid.UUID
	Status      string
	GalleryType string
	Search      string
	Limit       int
	Offset      int
}

// GalleryRepo handles gallery persistence.
type GalleryRepo struct {
	pool *pgxpool.Pool
}

// NewGalleryRepo creates a new GalleryRepo.
func NewGalleryRepo(pool *pgxpool.Pool) *GalleryRepo {
	return &GalleryRepo{pool: pool}
}

// generateSlug creates a URL-safe slug from the title.
func generateSlug(title string) string {
	slug := strings.ToLower(title)
	slug = strings.ReplaceAll(slug, " ", "-")
	// Remove non-alphanumeric except hyphens
	var result []byte
	for _, c := range []byte(slug) {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' {
			result = append(result, c)
		}
	}
	slug = string(result)
	// Add random suffix for uniqueness
	suffix := uuid.New().String()[:8]
	return slug + "-" + suffix
}

// Create inserts a new gallery.
func (r *GalleryRepo) Create(ctx context.Context, g *Gallery) error {
	if g.ID == uuid.Nil {
		g.ID = uuid.New()
	}
	if g.Slug == "" {
		g.Slug = generateSlug(g.Title)
	}
	g.CreatedAt = time.Now()
	g.UpdatedAt = g.CreatedAt

	_, err := r.pool.Exec(ctx,
		`INSERT INTO galleries (id, workspace_id, title, slug, description, cover_asset_id,
		 gallery_type, settings, password_hash, watermark_config, is_published, max_selections,
		 status, created_by, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
		g.ID, g.WorkspaceID, g.Title, g.Slug, g.Description, g.CoverAssetID,
		g.GalleryType, g.Settings, g.PasswordHash, g.WatermarkConfig, g.IsPublished,
		g.MaxSelections, g.Status, g.CreatedBy, g.CreatedAt, g.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("gallery repo create: %w", err)
	}
	return nil
}

// GetByID retrieves a gallery by ID.
func (r *GalleryRepo) GetByID(ctx context.Context, id uuid.UUID) (*Gallery, error) {
	g := &Gallery{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, workspace_id, title, slug, description, cover_asset_id, gallery_type,
		 settings, password_hash, watermark_config, is_published, max_selections, status,
		 created_by, created_at, updated_at, deleted_at
		 FROM galleries WHERE id = $1 AND deleted_at IS NULL`, id,
	).Scan(&g.ID, &g.WorkspaceID, &g.Title, &g.Slug, &g.Description, &g.CoverAssetID,
		&g.GalleryType, &g.Settings, &g.PasswordHash, &g.WatermarkConfig, &g.IsPublished,
		&g.MaxSelections, &g.Status, &g.CreatedBy, &g.CreatedAt, &g.UpdatedAt, &g.DeletedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("gallery repo get: %w", err)
	}
	return g, nil
}

// GetBySlug retrieves a gallery by slug (for public access).
func (r *GalleryRepo) GetBySlug(ctx context.Context, slug string) (*Gallery, error) {
	g := &Gallery{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, workspace_id, title, slug, description, cover_asset_id, gallery_type,
		 settings, password_hash, watermark_config, is_published, max_selections, status,
		 created_by, created_at, updated_at, deleted_at
		 FROM galleries WHERE slug = $1 AND deleted_at IS NULL`, slug,
	).Scan(&g.ID, &g.WorkspaceID, &g.Title, &g.Slug, &g.Description, &g.CoverAssetID,
		&g.GalleryType, &g.Settings, &g.PasswordHash, &g.WatermarkConfig, &g.IsPublished,
		&g.MaxSelections, &g.Status, &g.CreatedBy, &g.CreatedAt, &g.UpdatedAt, &g.DeletedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("gallery repo get by slug: %w", err)
	}
	return g, nil
}

// List retrieves galleries matching the filter.
func (r *GalleryRepo) List(ctx context.Context, f GalleryFilter) ([]Gallery, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 50
	}

	query := `SELECT id, workspace_id, title, slug, description, cover_asset_id, gallery_type,
		settings, password_hash, watermark_config, is_published, max_selections, status,
		created_by, created_at, updated_at, deleted_at
		FROM galleries WHERE workspace_id = $1 AND deleted_at IS NULL`
	args := []interface{}{f.WorkspaceID}
	argIdx := 2

	if f.Status != "" {
		query += fmt.Sprintf(" AND status = $%d", argIdx)
		args = append(args, f.Status)
		argIdx++
	}
	if f.GalleryType != "" {
		query += fmt.Sprintf(" AND gallery_type = $%d", argIdx)
		args = append(args, f.GalleryType)
		argIdx++
	}
	if f.Search != "" {
		query += fmt.Sprintf(" AND (title ILIKE $%d OR description ILIKE $%d)", argIdx, argIdx)
		args = append(args, "%"+f.Search+"%")
		argIdx++
	}

	query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
	args = append(args, limit, f.Offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("gallery repo list: %w", err)
	}
	defer rows.Close()

	var galleries []Gallery
	for rows.Next() {
		var g Gallery
		if err := rows.Scan(&g.ID, &g.WorkspaceID, &g.Title, &g.Slug, &g.Description,
			&g.CoverAssetID, &g.GalleryType, &g.Settings, &g.PasswordHash, &g.WatermarkConfig,
			&g.IsPublished, &g.MaxSelections, &g.Status, &g.CreatedBy, &g.CreatedAt,
			&g.UpdatedAt, &g.DeletedAt,
		); err != nil {
			return nil, fmt.Errorf("gallery repo list scan: %w", err)
		}
		galleries = append(galleries, g)
	}
	return galleries, rows.Err()
}

// Update modifies a gallery's fields.
func (r *GalleryRepo) Update(ctx context.Context, g *Gallery) error {
	g.UpdatedAt = time.Now()
	tag, err := r.pool.Exec(ctx,
		`UPDATE galleries SET title=$1, slug=$2, description=$3, cover_asset_id=$4,
		 gallery_type=$5, settings=$6, password_hash=$7, watermark_config=$8,
		 is_published=$9, max_selections=$10, status=$11, updated_at=$12
		 WHERE id=$13 AND deleted_at IS NULL`,
		g.Title, g.Slug, g.Description, g.CoverAssetID, g.GalleryType, g.Settings,
		g.PasswordHash, g.WatermarkConfig, g.IsPublished, g.MaxSelections, g.Status,
		g.UpdatedAt, g.ID,
	)
	if err != nil {
		return fmt.Errorf("gallery repo update: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("gallery not found or already deleted")
	}
	return nil
}

// SoftDelete marks a gallery as deleted.
func (r *GalleryRepo) SoftDelete(ctx context.Context, id uuid.UUID) error {
	now := time.Now()
	tag, err := r.pool.Exec(ctx,
		`UPDATE galleries SET deleted_at=$1, updated_at=$1 WHERE id=$2 AND deleted_at IS NULL`,
		now, id,
	)
	if err != nil {
		return fmt.Errorf("gallery repo delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("gallery not found or already deleted")
	}
	return nil
}

// UpdateCover sets the gallery's cover asset.
func (r *GalleryRepo) UpdateCover(ctx context.Context, galleryID uuid.UUID, coverAssetID *uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE galleries SET cover_asset_id=$1, updated_at=now() WHERE id=$2`,
		coverAssetID, galleryID,
	)
	if err != nil {
		return fmt.Errorf("gallery repo update cover: %w", err)
	}
	return nil
}
