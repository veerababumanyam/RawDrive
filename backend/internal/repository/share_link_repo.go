package repository

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ShareLink represents a shareable gallery link.
type ShareLink struct {
	ID              uuid.UUID              `json:"id"`
	GalleryID       uuid.UUID              `json:"gallery_id"`
	Token           string                 `json:"token"`
	PinHash         *string                `json:"-"`
	ExpiresAt       *time.Time             `json:"expires_at,omitempty"`
	Permissions     map[string]interface{} `json:"permissions"`
	DownloadAllowed bool                   `json:"download_allowed"`
	CreatedAt       time.Time              `json:"created_at"`
	RevokedAt       *time.Time             `json:"revoked_at,omitempty"`
}

// ShareLinkRepo handles share link persistence.
type ShareLinkRepo struct {
	pool *pgxpool.Pool
}

// NewShareLinkRepo creates a new ShareLinkRepo.
func NewShareLinkRepo(pool *pgxpool.Pool) *ShareLinkRepo {
	return &ShareLinkRepo{pool: pool}
}

func generateToken() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// Create inserts a new share link.
func (r *ShareLinkRepo) Create(ctx context.Context, sl *ShareLink) error {
	if sl.ID == uuid.Nil {
		sl.ID = uuid.New()
	}
	if sl.Token == "" {
		sl.Token = generateToken()
	}
	sl.CreatedAt = time.Now()

	_, err := r.pool.Exec(ctx,
		`INSERT INTO share_links (id, gallery_id, token, pin_hash, expires_at, permissions, download_allowed, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		sl.ID, sl.GalleryID, sl.Token, sl.PinHash, sl.ExpiresAt, sl.Permissions, sl.DownloadAllowed, sl.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("share link create: %w", err)
	}
	return nil
}

// GetByToken retrieves an active share link by token.
func (r *ShareLinkRepo) GetByToken(ctx context.Context, token string) (*ShareLink, error) {
	sl := &ShareLink{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, gallery_id, token, pin_hash, expires_at, permissions, download_allowed, created_at, revoked_at
		 FROM share_links WHERE token = $1 AND revoked_at IS NULL`, token,
	).Scan(&sl.ID, &sl.GalleryID, &sl.Token, &sl.PinHash, &sl.ExpiresAt, &sl.Permissions,
		&sl.DownloadAllowed, &sl.CreatedAt, &sl.RevokedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("share link get: %w", err)
	}
	return sl, nil
}

// ListByGallery returns all active share links for a gallery.
func (r *ShareLinkRepo) ListByGallery(ctx context.Context, galleryID uuid.UUID) ([]ShareLink, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, token, pin_hash, expires_at, permissions, download_allowed, created_at, revoked_at
		 FROM share_links WHERE gallery_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
		galleryID,
	)
	if err != nil {
		return nil, fmt.Errorf("share link list: %w", err)
	}
	defer rows.Close()

	var links []ShareLink
	for rows.Next() {
		var sl ShareLink
		if err := rows.Scan(&sl.ID, &sl.GalleryID, &sl.Token, &sl.PinHash, &sl.ExpiresAt,
			&sl.Permissions, &sl.DownloadAllowed, &sl.CreatedAt, &sl.RevokedAt); err != nil {
			return nil, fmt.Errorf("share link scan: %w", err)
		}
		links = append(links, sl)
	}
	return links, rows.Err()
}

// Revoke marks a share link as revoked.
func (r *ShareLinkRepo) Revoke(ctx context.Context, id uuid.UUID) error {
	now := time.Now()
	_, err := r.pool.Exec(ctx,
		`UPDATE share_links SET revoked_at = $1 WHERE id = $2 AND revoked_at IS NULL`,
		now, id,
	)
	if err != nil {
		return fmt.Errorf("share link revoke: %w", err)
	}
	return nil
}

// IncrementViewCount atomically increments the view counter for a share link.
func (r *ShareLinkRepo) IncrementViewCount(ctx context.Context, token string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE share_links SET permissions = jsonb_set(
			COALESCE(permissions, '{}'::jsonb),
			'{view_count}',
			to_jsonb(COALESCE((permissions->>'view_count')::int, 0) + 1)
		) WHERE token = $1 AND revoked_at IS NULL`,
		token,
	)
	if err != nil {
		return fmt.Errorf("share link increment views: %w", err)
	}
	return nil
}

// IncrementDownloadCount atomically increments the download counter for a share link.
func (r *ShareLinkRepo) IncrementDownloadCount(ctx context.Context, token string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE share_links SET permissions = jsonb_set(
			COALESCE(permissions, '{}'::jsonb),
			'{download_count}',
			to_jsonb(COALESCE((permissions->>'download_count')::int, 0) + 1)
		) WHERE token = $1 AND revoked_at IS NULL`,
		token,
	)
	if err != nil {
		return fmt.Errorf("share link increment downloads: %w", err)
	}
	return nil
}
