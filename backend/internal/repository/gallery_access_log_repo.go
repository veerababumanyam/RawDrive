package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GalleryAccessLog represents an immutable access log entry.
type GalleryAccessLog struct {
	ID               uuid.UUID  `json:"id"`
	GalleryID        uuid.UUID  `json:"gallery_id"`
	ShareLinkID      *uuid.UUID `json:"share_link_id,omitempty"`
	VisitorIP        string     `json:"visitor_ip,omitempty"`
	VisitorUserAgent string     `json:"visitor_user_agent,omitempty"`
	AccessType       string     `json:"access_type"`
	LinkType         string     `json:"link_type,omitempty"`
	VisitorName      string     `json:"visitor_name,omitempty"`
	VisitorEmail     string     `json:"visitor_email,omitempty"`
	VisitorUserID    *uuid.UUID `json:"visitor_user_id,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
}

// GalleryAccessLogRepo handles access log persistence (append-only).
type GalleryAccessLogRepo struct {
	pool *pgxpool.Pool
}

// NewGalleryAccessLogRepo creates a new GalleryAccessLogRepo.
func NewGalleryAccessLogRepo(pool *pgxpool.Pool) *GalleryAccessLogRepo {
	return &GalleryAccessLogRepo{pool: pool}
}

// Create inserts a new access log entry (append-only).
func (r *GalleryAccessLogRepo) Create(ctx context.Context, log *GalleryAccessLog) error {
	if log.ID == uuid.Nil {
		log.ID = uuid.New()
	}
	log.CreatedAt = time.Now()

	_, err := r.pool.Exec(ctx,
		`INSERT INTO gallery_access_logs (id, gallery_id, share_link_id, visitor_ip, visitor_user_agent, access_type, link_type, visitor_name, visitor_email, visitor_user_id, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		log.ID, log.GalleryID, log.ShareLinkID, log.VisitorIP, log.VisitorUserAgent, log.AccessType, log.LinkType, log.VisitorName, log.VisitorEmail, log.VisitorUserID, log.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("gallery access log create: %w", err)
	}
	return nil
}

// ListByGallery returns access log entries for a gallery, ordered by most recent.
func (r *GalleryAccessLogRepo) ListByGallery(ctx context.Context, galleryID uuid.UUID, limit, offset int) ([]GalleryAccessLog, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, share_link_id, visitor_ip, visitor_user_agent, access_type, link_type, visitor_name, visitor_email, visitor_user_id, created_at
		 FROM gallery_access_logs WHERE gallery_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		galleryID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("gallery access log list: %w", err)
	}
	defer rows.Close()

	var logs []GalleryAccessLog
	for rows.Next() {
		var l GalleryAccessLog
		if err := rows.Scan(&l.ID, &l.GalleryID, &l.ShareLinkID, &l.VisitorIP, &l.VisitorUserAgent, &l.AccessType, &l.LinkType, &l.VisitorName, &l.VisitorEmail, &l.VisitorUserID, &l.CreatedAt); err != nil {
			return nil, fmt.Errorf("gallery access log scan: %w", err)
		}
		logs = append(logs, l)
	}
	return logs, nil
}

// CountByGallery returns the total access log count for a gallery.
func (r *GalleryAccessLogRepo) CountByGallery(ctx context.Context, galleryID uuid.UUID) (int64, error) {
	var count int64
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM gallery_access_logs WHERE gallery_id = $1`, galleryID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("gallery access log count: %w", err)
	}
	return count, nil
}
