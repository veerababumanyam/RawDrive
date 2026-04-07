package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ProofingSelection represents a client's photo selection.
type ProofingSelection struct {
	ID          uuid.UUID `json:"id"`
	GalleryID   uuid.UUID `json:"gallery_id"`
	AssetID     uuid.UUID `json:"asset_id"`
	ClientName  string    `json:"client_name"`
	ClientEmail string    `json:"client_email"`
	Status      string    `json:"status"`
	Note        string    `json:"note"`
	CreatedAt   time.Time `json:"created_at"`
}

// ProofingRepo handles proofing selection persistence.
type ProofingRepo struct {
	pool *pgxpool.Pool
}

// NewProofingRepo creates a new ProofingRepo.
func NewProofingRepo(pool *pgxpool.Pool) *ProofingRepo {
	return &ProofingRepo{pool: pool}
}

// Create inserts a new proofing selection.
func (r *ProofingRepo) Create(ctx context.Context, ps *ProofingSelection) error {
	if ps.ID == uuid.Nil {
		ps.ID = uuid.New()
	}
	ps.CreatedAt = time.Now()

	_, err := r.pool.Exec(ctx,
		`INSERT INTO proofing_selections (id, gallery_id, asset_id, client_name, client_email, status, note, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		 ON CONFLICT (gallery_id, asset_id, client_email) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note`,
		ps.ID, ps.GalleryID, ps.AssetID, ps.ClientName, ps.ClientEmail, ps.Status, ps.Note, ps.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("proofing selection create: %w", err)
	}
	return nil
}

// ListByGallery returns all proofing selections for a gallery.
func (r *ProofingRepo) ListByGallery(ctx context.Context, galleryID uuid.UUID) ([]ProofingSelection, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, asset_id, client_name, client_email, status, note, created_at
		 FROM proofing_selections WHERE gallery_id = $1 ORDER BY created_at DESC`,
		galleryID,
	)
	if err != nil {
		return nil, fmt.Errorf("proofing list: %w", err)
	}
	defer rows.Close()

	var selections []ProofingSelection
	for rows.Next() {
		var ps ProofingSelection
		if err := rows.Scan(&ps.ID, &ps.GalleryID, &ps.AssetID, &ps.ClientName,
			&ps.ClientEmail, &ps.Status, &ps.Note, &ps.CreatedAt); err != nil {
			return nil, fmt.Errorf("proofing scan: %w", err)
		}
		selections = append(selections, ps)
	}
	return selections, rows.Err()
}

// ListByClient returns selections for a specific client email in a gallery.
func (r *ProofingRepo) ListByClient(ctx context.Context, galleryID uuid.UUID, clientEmail string) ([]ProofingSelection, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, asset_id, client_name, client_email, status, note, created_at
		 FROM proofing_selections WHERE gallery_id = $1 AND client_email = $2 ORDER BY created_at DESC`,
		galleryID, clientEmail,
	)
	if err != nil {
		return nil, fmt.Errorf("proofing list by client: %w", err)
	}
	defer rows.Close()

	var selections []ProofingSelection
	for rows.Next() {
		var ps ProofingSelection
		if err := rows.Scan(&ps.ID, &ps.GalleryID, &ps.AssetID, &ps.ClientName,
			&ps.ClientEmail, &ps.Status, &ps.Note, &ps.CreatedAt); err != nil {
			return nil, fmt.Errorf("proofing scan: %w", err)
		}
		selections = append(selections, ps)
	}
	return selections, rows.Err()
}

// UpdateStatus changes a selection's status.
func (r *ProofingRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE proofing_selections SET status = $1 WHERE id = $2`,
		status, id,
	)
	if err != nil {
		return fmt.Errorf("proofing update status: %w", err)
	}
	return nil
}

// CountByGalleryAndClient returns the number of selections for a client in a gallery.
func (r *ProofingRepo) CountByGalleryAndClient(ctx context.Context, galleryID uuid.UUID, clientEmail string) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM proofing_selections WHERE gallery_id = $1 AND client_email = $2`,
		galleryID, clientEmail,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("proofing count: %w", err)
	}
	return count, nil
}
