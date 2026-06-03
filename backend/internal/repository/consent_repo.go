package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ConsentRecord represents a privacy consent record.
// This is an append-only record — each grant/withdrawal creates a NEW row.
// The latest row per (visitor, gallery, consent_type) is the authoritative state.
type ConsentRecord struct {
	ID                 uuid.UUID  `json:"id"`
	GalleryID          *uuid.UUID `json:"gallery_id,omitempty"`
	VisitorEmail       string     `json:"visitor_email"`
	VisitorIP          string     `json:"visitor_ip,omitempty"`
	UserAgent          string     `json:"user_agent,omitempty"`
	ConsentType        string     `json:"consent_type"`
	Granted            bool       `json:"granted"`
	Language           string     `json:"language"`
	ConsentVersionHash string     `json:"consent_version_hash,omitempty"`
	LegalBasis         string     `json:"legal_basis,omitempty"`
	WithdrawnAt        *time.Time `json:"withdrawn_at,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
}

// ConsentRepo handles consent record persistence.
type ConsentRepo struct {
	pool *pgxpool.Pool
}

// NewConsentRepo creates a new ConsentRepo.
func NewConsentRepo(pool *pgxpool.Pool) *ConsentRepo {
	return &ConsentRepo{pool: pool}
}

// Create inserts a new consent record. Every call produces a new row — there is
// no UPDATE path. History is preserved so the audit trail can prove when a user
// granted vs when they withdrew, which language they saw, and what version hash
// that text corresponded to.
func (r *ConsentRepo) Create(ctx context.Context, c *ConsentRecord) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	c.CreatedAt = time.Now()
	if c.LegalBasis == "" {
		c.LegalBasis = "consent"
	}
	_, err := r.pool.Exec(ctx,
		`INSERT INTO consent_records
		    (id, gallery_id, visitor_email, visitor_ip, user_agent,
		     consent_type, granted, language, consent_version_hash, legal_basis, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		c.ID, c.GalleryID, c.VisitorEmail, c.VisitorIP, c.UserAgent,
		c.ConsentType, c.Granted, c.Language, c.ConsentVersionHash, c.LegalBasis, c.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("consent record create: %w", err)
	}
	return nil
}

// Withdraw marks any still-active consent grants as withdrawn. This is an
// optimization for read performance; the authoritative withdrawal record is the
// most-recent row from Create() with granted=false.
func (r *ConsentRepo) Withdraw(ctx context.Context, email, consentType string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE consent_records SET withdrawn_at = now()
		 WHERE visitor_email = $1 AND consent_type = $2 AND withdrawn_at IS NULL`,
		email, consentType,
	)
	if err != nil {
		return fmt.Errorf("consent withdraw: %w", err)
	}
	return nil
}

// ListByEmail returns all consent records for a visitor, newest first.
func (r *ConsentRepo) ListByEmail(ctx context.Context, email string) ([]ConsentRecord, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, visitor_email, COALESCE(visitor_ip, ''), COALESCE(user_agent, ''),
		        consent_type, granted, language,
		        COALESCE(consent_version_hash, ''), COALESCE(legal_basis, 'consent'),
		        withdrawn_at, created_at
		 FROM consent_records WHERE visitor_email = $1
		 ORDER BY created_at DESC`, email,
	)
	if err != nil {
		return nil, fmt.Errorf("consent list: %w", err)
	}
	defer rows.Close()

	var records []ConsentRecord
	for rows.Next() {
		var c ConsentRecord
		if err := rows.Scan(
			&c.ID, &c.GalleryID, &c.VisitorEmail, &c.VisitorIP, &c.UserAgent,
			&c.ConsentType, &c.Granted, &c.Language,
			&c.ConsentVersionHash, &c.LegalBasis,
			&c.WithdrawnAt, &c.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("consent scan: %w", err)
		}
		records = append(records, c)
	}
	return records, nil
}

// ListByGalleryAndEmail returns all consent records for a visitor WITHIN a
// single gallery, newest first. Binding the lookup to (gallery_id,
// visitor_email) means a public caller can only read the consent state for the
// gallery whose slug they already legitimately hold — it cannot be used as the
// platform-wide PII / membership oracle that the unscoped ListByEmail would be
// if exposed on the public surface (security audit 2026-05-30, V11).
func (r *ConsentRepo) ListByGalleryAndEmail(ctx context.Context, galleryID uuid.UUID, email string) ([]ConsentRecord, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, visitor_email, COALESCE(visitor_ip, ''), COALESCE(user_agent, ''),
		        consent_type, granted, language,
		        COALESCE(consent_version_hash, ''), COALESCE(legal_basis, 'consent'),
		        withdrawn_at, created_at
		 FROM consent_records WHERE gallery_id = $1 AND visitor_email = $2
		 ORDER BY created_at DESC`, galleryID, email,
	)
	if err != nil {
		return nil, fmt.Errorf("consent list by gallery+email: %w", err)
	}
	defer rows.Close()

	var records []ConsentRecord
	for rows.Next() {
		var c ConsentRecord
		if err := rows.Scan(
			&c.ID, &c.GalleryID, &c.VisitorEmail, &c.VisitorIP, &c.UserAgent,
			&c.ConsentType, &c.Granted, &c.Language,
			&c.ConsentVersionHash, &c.LegalBasis,
			&c.WithdrawnAt, &c.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("consent scan: %w", err)
		}
		records = append(records, c)
	}
	return records, nil
}

// CountByGalleryAndType returns a count matrix of grants per purpose for a gallery.
// Useful for the studio dashboard showing how many clients granted each purpose.
func (r *ConsentRepo) CountByGalleryAndType(ctx context.Context, galleryID uuid.UUID) (map[string]int, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT consent_type, COUNT(*) FILTER (WHERE granted = true AND withdrawn_at IS NULL)
		 FROM consent_records
		 WHERE gallery_id = $1
		 GROUP BY consent_type`,
		galleryID,
	)
	if err != nil {
		return nil, fmt.Errorf("consent count: %w", err)
	}
	defer rows.Close()

	counts := make(map[string]int)
	for rows.Next() {
		var ct string
		var count int
		if err := rows.Scan(&ct, &count); err != nil {
			return nil, err
		}
		counts[ct] = count
	}
	return counts, nil
}
