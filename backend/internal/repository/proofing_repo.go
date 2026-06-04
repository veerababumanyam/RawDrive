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
		 ON CONFLICT (gallery_id, asset_id, client_email) DO UPDATE SET client_name = EXCLUDED.client_name, status = EXCLUDED.status, note = EXCLUDED.note`,
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

// UpdateStatusInWorkspace changes a selection's status only if the selection's
// owning gallery belongs to the given workspace. The workspace scoping is
// enforced atomically in the WHERE clause (no fetch-then-check) so there is no
// TOCTOU window. Returns the number of rows affected; 0 means the selection
// either does not exist or belongs to another tenant — the caller maps that to
// 404 so cross-tenant existence is never disclosed.
func (r *ProofingRepo) UpdateStatusInWorkspace(ctx context.Context, selectionID uuid.UUID, status string, workspaceID uuid.UUID) (int64, error) {
	tag, err := r.pool.Exec(ctx,
		`UPDATE proofing_selections ps SET status = $2
		 WHERE ps.id = $1
		   AND EXISTS (
		       SELECT 1 FROM galleries g
		       WHERE g.id = ps.gallery_id AND g.workspace_id = $3
		   )`,
		selectionID, status, workspaceID,
	)
	if err != nil {
		return 0, fmt.Errorf("proofing update status in workspace: %w", err)
	}
	return tag.RowsAffected(), nil
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

// CountExistingByGalleryClientAndAssets returns how many of the requested
// assets already have selections for this client in this gallery. Used by the
// service to make max_selections count only new picks; re-submitting an
// existing pick updates its note/status without consuming another slot.
func (r *ProofingRepo) CountExistingByGalleryClientAndAssets(ctx context.Context, galleryID uuid.UUID, clientEmail string, assetIDs []uuid.UUID) (int, error) {
	if len(assetIDs) == 0 {
		return 0, nil
	}
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(DISTINCT asset_id)
		   FROM proofing_selections
		  WHERE gallery_id = $1
		    AND client_email = $2
		    AND asset_id = ANY($3::uuid[])`,
		galleryID, clientEmail, assetIDs,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("proofing count existing requested assets: %w", err)
	}
	return count, nil
}

// CountAssetsInGallery returns how many distinct requested asset IDs are linked
// to the gallery. Public proofing submissions call this before writing rows so
// a visitor cannot attach arbitrary/cross-gallery assets to a selection export.
func (r *ProofingRepo) CountAssetsInGallery(ctx context.Context, galleryID uuid.UUID, assetIDs []uuid.UUID) (int, error) {
	if len(assetIDs) == 0 {
		return 0, nil
	}
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(DISTINCT asset_id)
		   FROM gallery_assets
		  WHERE gallery_id = $1
		    AND asset_id = ANY($2::uuid[])`,
		galleryID, assetIDs,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("proofing count gallery asset membership: %w", err)
	}
	return count, nil
}

// UpdateSessionID updates a selection's session_id.
func (r *ProofingRepo) UpdateSessionID(ctx context.Context, id uuid.UUID, sessionID *uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE proofing_selections SET session_id = $1 WHERE id = $2`,
		sessionID, id,
	)
	if err != nil {
		return fmt.Errorf("proofing update session_id: %w", err)
	}
	return nil
}

// UpdateStarRating updates a selection's star rating.
func (r *ProofingRepo) UpdateStarRating(ctx context.Context, id uuid.UUID, rating int) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE proofing_selections SET star_rating = $1 WHERE id = $2`,
		rating, id,
	)
	if err != nil {
		return fmt.Errorf("proofing update star_rating: %w", err)
	}
	return nil
}

// UpdateColorLabel updates a selection's color label.
func (r *ProofingRepo) UpdateColorLabel(ctx context.Context, id uuid.UUID, label string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE proofing_selections SET color_label = $1 WHERE id = $2`,
		label, id,
	)
	if err != nil {
		return fmt.Errorf("proofing update color_label: %w", err)
	}
	return nil
}

// UpdateStarRatingInWorkspace updates a selection's star rating only if the
// selection's owning gallery belongs to the given workspace. Scoping is enforced
// atomically in the WHERE clause (no TOCTOU). Returns rows affected; 0 ⇒ the
// selection is missing or belongs to another tenant (caller maps to 404).
func (r *ProofingRepo) UpdateStarRatingInWorkspace(ctx context.Context, selectionID uuid.UUID, rating int, workspaceID uuid.UUID) (int64, error) {
	tag, err := r.pool.Exec(ctx,
		`UPDATE proofing_selections ps SET star_rating = $2
		 WHERE ps.id = $1
		   AND EXISTS (
		       SELECT 1 FROM galleries g
		       WHERE g.id = ps.gallery_id AND g.workspace_id = $3
		   )`,
		selectionID, rating, workspaceID,
	)
	if err != nil {
		return 0, fmt.Errorf("proofing update star_rating in workspace: %w", err)
	}
	return tag.RowsAffected(), nil
}

// UpdateColorLabelInWorkspace updates a selection's color label only if the
// selection's owning gallery belongs to the given workspace (atomic, no TOCTOU).
func (r *ProofingRepo) UpdateColorLabelInWorkspace(ctx context.Context, selectionID uuid.UUID, label string, workspaceID uuid.UUID) (int64, error) {
	tag, err := r.pool.Exec(ctx,
		`UPDATE proofing_selections ps SET color_label = $2
		 WHERE ps.id = $1
		   AND EXISTS (
		       SELECT 1 FROM galleries g
		       WHERE g.id = ps.gallery_id AND g.workspace_id = $3
		   )`,
		selectionID, label, workspaceID,
	)
	if err != nil {
		return 0, fmt.Errorf("proofing update color_label in workspace: %w", err)
	}
	return tag.RowsAffected(), nil
}
