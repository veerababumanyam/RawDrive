package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AlbumApproval represents an immutable client album approval record.
type AlbumApproval struct {
	ID               uuid.UUID  `json:"id"`
	GalleryID        uuid.UUID  `json:"gallery_id"`
	SessionID        *uuid.UUID `json:"session_id,omitempty"`
	ApprovedByName   string     `json:"approved_by_name"`
	ApprovedByEmail  string     `json:"approved_by_email"`
	ApprovedByUserID *uuid.UUID `json:"approved_by_user_id,omitempty"`
	VersionHash      string     `json:"version_hash"`
	ConfigSnapshot   []byte     `json:"config_snapshot"`
	IPAddress        string     `json:"ip_address,omitempty"`
	UserAgent        string     `json:"user_agent,omitempty"`
	Notes            string     `json:"notes,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
}

// AlbumApprovalRepo handles album approval persistence (append-only).
type AlbumApprovalRepo struct {
	pool *pgxpool.Pool
}

// NewAlbumApprovalRepo creates a new AlbumApprovalRepo.
func NewAlbumApprovalRepo(pool *pgxpool.Pool) *AlbumApprovalRepo {
	return &AlbumApprovalRepo{pool: pool}
}

// Create inserts a new album approval record (append-only).
func (r *AlbumApprovalRepo) Create(ctx context.Context, a *AlbumApproval) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	a.CreatedAt = time.Now()

	_, err := r.pool.Exec(ctx,
		`INSERT INTO album_approvals (id, gallery_id, session_id, approved_by_name, approved_by_email, approved_by_user_id, version_hash, config_snapshot, ip_address, user_agent, notes, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		a.ID, a.GalleryID, a.SessionID, a.ApprovedByName, a.ApprovedByEmail, a.ApprovedByUserID, a.VersionHash, a.ConfigSnapshot, a.IPAddress, a.UserAgent, a.Notes, a.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("album approval create: %w", err)
	}
	return nil
}

// GetByID returns an album approval by ID.
func (r *AlbumApprovalRepo) GetByID(ctx context.Context, id uuid.UUID) (*AlbumApproval, error) {
	a := &AlbumApproval{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, gallery_id, session_id, approved_by_name, approved_by_email, approved_by_user_id, version_hash, config_snapshot, ip_address, user_agent, notes, created_at
		 FROM album_approvals WHERE id = $1`, id,
	).Scan(&a.ID, &a.GalleryID, &a.SessionID, &a.ApprovedByName, &a.ApprovedByEmail, &a.ApprovedByUserID, &a.VersionHash, &a.ConfigSnapshot, &a.IPAddress, &a.UserAgent, &a.Notes, &a.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("album approval get: %w", err)
	}
	return a, nil
}

// ListByGallery returns all approval records for a gallery.
func (r *AlbumApprovalRepo) ListByGallery(ctx context.Context, galleryID uuid.UUID) ([]AlbumApproval, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, session_id, approved_by_name, approved_by_email, approved_by_user_id, version_hash, config_snapshot, ip_address, user_agent, notes, created_at
		 FROM album_approvals WHERE gallery_id = $1 ORDER BY created_at DESC`, galleryID,
	)
	if err != nil {
		return nil, fmt.Errorf("album approval list: %w", err)
	}
	defer rows.Close()

	var approvals []AlbumApproval
	for rows.Next() {
		var a AlbumApproval
		if err := rows.Scan(&a.ID, &a.GalleryID, &a.SessionID, &a.ApprovedByName, &a.ApprovedByEmail, &a.ApprovedByUserID, &a.VersionHash, &a.ConfigSnapshot, &a.IPAddress, &a.UserAgent, &a.Notes, &a.CreatedAt); err != nil {
			return nil, fmt.Errorf("album approval scan: %w", err)
		}
		approvals = append(approvals, a)
	}
	return approvals, nil
}
