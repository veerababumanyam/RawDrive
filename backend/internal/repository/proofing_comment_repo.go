package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ProofingComment represents a comment on a gallery asset.
type ProofingComment struct {
	ID           uuid.UUID  `json:"id"`
	GalleryID    uuid.UUID  `json:"gallery_id"`
	AssetID      uuid.UUID  `json:"asset_id"`
	ParentID     *uuid.UUID `json:"parent_id,omitempty"`
	AuthorName   string     `json:"author_name"`
	AuthorEmail  string     `json:"author_email,omitempty"`
	AuthorUserID *uuid.UUID `json:"author_user_id,omitempty"`
	Body         string     `json:"body"`
	PinX         *float64   `json:"pin_x,omitempty"`
	PinY         *float64   `json:"pin_y,omitempty"`
	IsResolved   bool       `json:"is_resolved"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// ProofingCommentRepo handles proofing comment persistence.
type ProofingCommentRepo struct {
	pool *pgxpool.Pool
}

// NewProofingCommentRepo creates a new ProofingCommentRepo.
func NewProofingCommentRepo(pool *pgxpool.Pool) *ProofingCommentRepo {
	return &ProofingCommentRepo{pool: pool}
}

// Create inserts a new proofing comment.
func (r *ProofingCommentRepo) Create(ctx context.Context, c *ProofingComment) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	now := time.Now()
	c.CreatedAt = now
	c.UpdatedAt = now

	_, err := r.pool.Exec(ctx,
		`INSERT INTO proofing_comments (id, gallery_id, asset_id, parent_id, author_name, author_email, author_user_id, body, pin_x, pin_y, is_resolved, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		c.ID, c.GalleryID, c.AssetID, c.ParentID, c.AuthorName, c.AuthorEmail, c.AuthorUserID, c.Body, c.PinX, c.PinY, c.IsResolved, c.CreatedAt, c.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("proofing comment create: %w", err)
	}
	return nil
}

// GetByAsset returns all top-level comments for an asset in a gallery.
func (r *ProofingCommentRepo) GetByAsset(ctx context.Context, galleryID, assetID uuid.UUID) ([]ProofingComment, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, asset_id, parent_id, author_name, author_email, author_user_id, body, pin_x, pin_y, is_resolved, created_at, updated_at
		 FROM proofing_comments WHERE gallery_id = $1 AND asset_id = $2 AND parent_id IS NULL
		 ORDER BY created_at`, galleryID, assetID,
	)
	if err != nil {
		return nil, fmt.Errorf("proofing comment get by asset: %w", err)
	}
	defer rows.Close()

	return r.scanComments(rows)
}

// GetThread returns all replies to a comment.
func (r *ProofingCommentRepo) GetThread(ctx context.Context, parentID uuid.UUID) ([]ProofingComment, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, asset_id, parent_id, author_name, author_email, author_user_id, body, pin_x, pin_y, is_resolved, created_at, updated_at
		 FROM proofing_comments WHERE parent_id = $1
		 ORDER BY created_at`, parentID,
	)
	if err != nil {
		return nil, fmt.Errorf("proofing comment get thread: %w", err)
	}
	defer rows.Close()

	return r.scanComments(rows)
}

// Update updates a comment body.
func (r *ProofingCommentRepo) Update(ctx context.Context, id uuid.UUID, body string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE proofing_comments SET body = $2, updated_at = now() WHERE id = $1`,
		id, body,
	)
	if err != nil {
		return fmt.Errorf("proofing comment update: %w", err)
	}
	return nil
}

// Resolve marks a comment as resolved.
func (r *ProofingCommentRepo) Resolve(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE proofing_comments SET is_resolved = true, updated_at = now() WHERE id = $1`, id,
	)
	if err != nil {
		return fmt.Errorf("proofing comment resolve: %w", err)
	}
	return nil
}

// Delete removes a comment.
func (r *ProofingCommentRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM proofing_comments WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("proofing comment delete: %w", err)
	}
	return nil
}

func (r *ProofingCommentRepo) scanComments(rows interface {
	Next() bool
	Scan(...interface{}) error
	Err() error
}) ([]ProofingComment, error) {
	var comments []ProofingComment
	for rows.Next() {
		var c ProofingComment
		if err := rows.Scan(&c.ID, &c.GalleryID, &c.AssetID, &c.ParentID, &c.AuthorName, &c.AuthorEmail, &c.AuthorUserID, &c.Body, &c.PinX, &c.PinY, &c.IsResolved, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, fmt.Errorf("proofing comment scan: %w", err)
		}
		comments = append(comments, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("proofing comment rows: %w", err)
	}
	return comments, nil
}
