package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ProofingSession represents a named selection list for a gallery.
type ProofingSession struct {
	ID             uuid.UUID `json:"id"`
	GalleryID      uuid.UUID `json:"gallery_id"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	SessionType    string    `json:"session_type"`
	CreatedByName  string    `json:"created_by_name,omitempty"`
	CreatedByEmail string    `json:"created_by_email,omitempty"`
	IsSystem       bool      `json:"is_system"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// ProofingSessionRepo handles proofing session persistence.
type ProofingSessionRepo struct {
	pool *pgxpool.Pool
}

// NewProofingSessionRepo creates a new ProofingSessionRepo.
func NewProofingSessionRepo(pool *pgxpool.Pool) *ProofingSessionRepo {
	return &ProofingSessionRepo{pool: pool}
}

// Create inserts a new proofing session.
func (r *ProofingSessionRepo) Create(ctx context.Context, s *ProofingSession) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	now := time.Now()
	s.CreatedAt = now
	s.UpdatedAt = now

	_, err := r.pool.Exec(ctx,
		`INSERT INTO proofing_sessions (id, gallery_id, name, description, session_type, created_by_name, created_by_email, is_system, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		s.ID, s.GalleryID, s.Name, s.Description, s.SessionType, s.CreatedByName, s.CreatedByEmail, s.IsSystem, s.CreatedAt, s.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("proofing session create: %w", err)
	}
	return nil
}

// GetByID returns a proofing session by ID.
func (r *ProofingSessionRepo) GetByID(ctx context.Context, id uuid.UUID) (*ProofingSession, error) {
	s := &ProofingSession{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, gallery_id, name, description, session_type, created_by_name, created_by_email, is_system, created_at, updated_at
		 FROM proofing_sessions WHERE id = $1`, id,
	).Scan(&s.ID, &s.GalleryID, &s.Name, &s.Description, &s.SessionType, &s.CreatedByName, &s.CreatedByEmail, &s.IsSystem, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("proofing session get: %w", err)
	}
	return s, nil
}

// ListByGallery returns all proofing sessions for a gallery.
func (r *ProofingSessionRepo) ListByGallery(ctx context.Context, galleryID uuid.UUID) ([]ProofingSession, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, name, description, session_type, created_by_name, created_by_email, is_system, created_at, updated_at
		 FROM proofing_sessions WHERE gallery_id = $1 ORDER BY created_at`, galleryID,
	)
	if err != nil {
		return nil, fmt.Errorf("proofing session list: %w", err)
	}
	defer rows.Close()

	var sessions []ProofingSession
	for rows.Next() {
		var s ProofingSession
		if err := rows.Scan(&s.ID, &s.GalleryID, &s.Name, &s.Description, &s.SessionType, &s.CreatedByName, &s.CreatedByEmail, &s.IsSystem, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, fmt.Errorf("proofing session scan: %w", err)
		}
		sessions = append(sessions, s)
	}
	return sessions, nil
}

// Update updates a proofing session name and description.
func (r *ProofingSessionRepo) Update(ctx context.Context, id uuid.UUID, name, description string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE proofing_sessions SET name = $2, description = $3, updated_at = now() WHERE id = $1`,
		id, name, description,
	)
	if err != nil {
		return fmt.Errorf("proofing session update: %w", err)
	}
	return nil
}

// Delete removes a proofing session.
func (r *ProofingSessionRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM proofing_sessions WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("proofing session delete: %w", err)
	}
	return nil
}
