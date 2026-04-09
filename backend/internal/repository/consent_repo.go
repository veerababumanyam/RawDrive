package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ConsentRecord represents a privacy consent record.
type ConsentRecord struct {
	ID           uuid.UUID  `json:"id"`
	GalleryID    *uuid.UUID `json:"gallery_id,omitempty"`
	VisitorEmail string     `json:"visitor_email"`
	VisitorIP    string     `json:"visitor_ip,omitempty"`
	ConsentType  string     `json:"consent_type"`
	Granted      bool       `json:"granted"`
	Language     string     `json:"language"`
	WithdrawnAt  *time.Time `json:"withdrawn_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

// ConsentRepo handles consent record persistence.
type ConsentRepo struct {
	pool *pgxpool.Pool
}

// NewConsentRepo creates a new ConsentRepo.
func NewConsentRepo(pool *pgxpool.Pool) *ConsentRepo {
	return &ConsentRepo{pool: pool}
}

// Create records a consent decision.
func (r *ConsentRepo) Create(ctx context.Context, c *ConsentRecord) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	c.CreatedAt = time.Now()
	_, err := r.pool.Exec(ctx,
		`INSERT INTO consent_records (id, gallery_id, visitor_email, visitor_ip, consent_type, granted, language, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		c.ID, c.GalleryID, c.VisitorEmail, c.VisitorIP, c.ConsentType, c.Granted, c.Language, c.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("consent record create: %w", err)
	}
	return nil
}

// Withdraw marks a consent record as withdrawn.
func (r *ConsentRepo) Withdraw(ctx context.Context, email, consentType string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE consent_records SET withdrawn_at = now() WHERE visitor_email = $1 AND consent_type = $2 AND withdrawn_at IS NULL`,
		email, consentType,
	)
	if err != nil {
		return fmt.Errorf("consent withdraw: %w", err)
	}
	return nil
}

// ListByEmail returns all consent records for a visitor.
func (r *ConsentRepo) ListByEmail(ctx context.Context, email string) ([]ConsentRecord, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, visitor_email, visitor_ip, consent_type, granted, language, withdrawn_at, created_at
		 FROM consent_records WHERE visitor_email = $1 ORDER BY created_at DESC`, email,
	)
	if err != nil {
		return nil, fmt.Errorf("consent list: %w", err)
	}
	defer rows.Close()

	var records []ConsentRecord
	for rows.Next() {
		var c ConsentRecord
		if err := rows.Scan(&c.ID, &c.GalleryID, &c.VisitorEmail, &c.VisitorIP, &c.ConsentType, &c.Granted, &c.Language, &c.WithdrawnAt, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("consent scan: %w", err)
		}
		records = append(records, c)
	}
	return records, nil
}
