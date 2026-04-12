package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GalleryShareLog records a gallery shared via email.
type GalleryShareLog struct {
	ID           uuid.UUID `json:"id"`
	GalleryID    uuid.UUID `json:"gallery_id"`
	SentToEmail  string    `json:"sent_to_email"`
	SentByUserID uuid.UUID `json:"sent_by_user_id"`
	Message      string    `json:"message"`
	SentAt       time.Time `json:"sent_at"`
}

// GalleryShareLogRepo persists gallery share logs.
type GalleryShareLogRepo struct {
	pool *pgxpool.Pool
}

// NewGalleryShareLogRepo creates a new GalleryShareLogRepo.
func NewGalleryShareLogRepo(pool *pgxpool.Pool) *GalleryShareLogRepo {
	return &GalleryShareLogRepo{pool: pool}
}

// Create inserts a share log entry.
func (r *GalleryShareLogRepo) Create(ctx context.Context, log GalleryShareLog) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO gallery_share_logs (id, gallery_id, sent_to_email, sent_by_user_id, message, sent_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		log.ID, log.GalleryID, log.SentToEmail, log.SentByUserID, log.Message, log.SentAt,
	)
	if err != nil {
		return fmt.Errorf("create gallery share log: %w", err)
	}
	return nil
}

// ListByGallery returns recent share logs for a gallery.
func (r *GalleryShareLogRepo) ListByGallery(ctx context.Context, galleryID uuid.UUID, limit int) ([]GalleryShareLog, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, sent_to_email, sent_by_user_id, message, sent_at
		 FROM gallery_share_logs WHERE gallery_id = $1 ORDER BY sent_at DESC LIMIT $2`,
		galleryID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("list gallery share logs: %w", err)
	}
	defer rows.Close()

	var logs []GalleryShareLog
	for rows.Next() {
		var l GalleryShareLog
		if err := rows.Scan(&l.ID, &l.GalleryID, &l.SentToEmail, &l.SentByUserID, &l.Message, &l.SentAt); err != nil {
			return nil, fmt.Errorf("scan gallery share log: %w", err)
		}
		logs = append(logs, l)
	}
	return logs, rows.Err()
}

// CountRecentByGallery counts shares since a timestamp (for rate limiting).
func (r *GalleryShareLogRepo) CountRecentByGallery(ctx context.Context, galleryID uuid.UUID, since time.Time) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM gallery_share_logs WHERE gallery_id = $1 AND sent_at >= $2`,
		galleryID, since,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count recent gallery share logs: %w", err)
	}
	return count, nil
}
