package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GalleryFavorite is a single guest-session "heart this photo" event for
// a public gallery viewer. See migration 105_create_gallery_favorites for
// the rationale separating this from proofing_selections.
type GalleryFavorite struct {
	ID             uuid.UUID `json:"id"`
	GalleryID      uuid.UUID `json:"gallery_id"`
	AssetID        uuid.UUID `json:"asset_id"`
	GuestSessionID string    `json:"guest_session_id"`
	CreatedAt      time.Time `json:"created_at"`
}

// GalleryFavoritesSummary is the owner-facing aggregation used by the
// gallery dashboard tile and the upcoming "favorites breakdown" view.
type GalleryFavoritesSummary struct {
	GalleryID         uuid.UUID                `json:"gallery_id"`
	TotalFavorites    int                      `json:"total_favorites"`     // every heart, all sessions
	UniqueAssetsCount int                      `json:"unique_assets_count"` // photos that got at least one heart
	UniqueSessions    int                      `json:"unique_sessions"`     // distinct guest sessions
	ByAsset           []GalleryFavoriteByAsset `json:"by_asset"`            // per-asset breakdown, newest interest first
}

// GalleryFavoriteByAsset is one row of the per-asset aggregation. The
// dashboard uses Count to render a small heart badge on the thumbnail.
type GalleryFavoriteByAsset struct {
	AssetID uuid.UUID `json:"asset_id"`
	Count   int       `json:"count"`
}

// GalleryFavoritesRepo handles persistence for anonymous guest favorites.
type GalleryFavoritesRepo struct {
	pool *pgxpool.Pool
}

// NewGalleryFavoritesRepo wires a pool into the repo.
func NewGalleryFavoritesRepo(pool *pgxpool.Pool) *GalleryFavoritesRepo {
	return &GalleryFavoritesRepo{pool: pool}
}

// Upsert idempotently records that this guest session favorited this
// asset. Re-favoriting is a no-op (returns existing row).
//
// ON CONFLICT DO NOTHING means a re-favorite returns nil error and keeps
// the original created_at — preferred over DO UPDATE because the favorite
// timestamp shouldn't drift every time the lightbox re-hydrates.
func (r *GalleryFavoritesRepo) Upsert(ctx context.Context, fav *GalleryFavorite) error {
	if fav.ID == uuid.Nil {
		fav.ID = uuid.New()
	}
	if fav.CreatedAt.IsZero() {
		fav.CreatedAt = time.Now().UTC()
	}

	_, err := r.pool.Exec(ctx,
		`INSERT INTO gallery_favorites (id, gallery_id, asset_id, guest_session_id, created_at)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (gallery_id, asset_id, guest_session_id) DO NOTHING`,
		fav.ID, fav.GalleryID, fav.AssetID, fav.GuestSessionID, fav.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("gallery favorite upsert: %w", err)
	}
	return nil
}

// Delete removes a single guest-session favorite. Idempotent — deleting a
// row that doesn't exist returns nil so the public DELETE endpoint can be
// called blindly without a prior existence check.
func (r *GalleryFavoritesRepo) Delete(ctx context.Context, galleryID, assetID uuid.UUID, guestSessionID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM gallery_favorites
		 WHERE gallery_id = $1 AND asset_id = $2 AND guest_session_id = $3`,
		galleryID, assetID, guestSessionID,
	)
	if err != nil {
		return fmt.Errorf("gallery favorite delete: %w", err)
	}
	return nil
}

// ListSessionAssetIDs returns the asset IDs this guest session has
// favorited in this gallery. Used by the public GET endpoint to
// re-hydrate the Star button state on share-link page load.
//
// Returns an empty slice (never nil) when the session has no favorites
// so the frontend can map directly without nil-checks.
func (r *GalleryFavoritesRepo) ListSessionAssetIDs(ctx context.Context, galleryID uuid.UUID, guestSessionID string) ([]uuid.UUID, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT asset_id
		 FROM gallery_favorites
		 WHERE gallery_id = $1 AND guest_session_id = $2
		 ORDER BY created_at DESC`,
		galleryID, guestSessionID,
	)
	if err != nil {
		return nil, fmt.Errorf("gallery favorites list session: %w", err)
	}
	defer rows.Close()

	out := make([]uuid.UUID, 0)
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("gallery favorites scan: %w", err)
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// ListAssetIDsByGallery returns the distinct asset IDs that have any
// favorite in this gallery (across all guest sessions). Used by the
// "Favorites" smart album resolver to populate the sub-gallery filter
// without exposing per-session detail.
//
// Ordered by most-favorited-first so the album view surfaces the photos
// clients have rallied around. Returns empty slice (never nil) when no
// favorites exist so downstream intersection logic doesn't need to
// nil-check.
func (r *GalleryFavoritesRepo) ListAssetIDsByGallery(ctx context.Context, galleryID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT asset_id
		 FROM gallery_favorites
		 WHERE gallery_id = $1
		 GROUP BY asset_id
		 ORDER BY COUNT(*) DESC, MIN(created_at) ASC`,
		galleryID,
	)
	if err != nil {
		return nil, fmt.Errorf("gallery favorites list by gallery: %w", err)
	}
	defer rows.Close()

	out := make([]uuid.UUID, 0)
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("gallery favorites by-gallery scan: %w", err)
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// SummarizeGallery returns the owner-facing aggregation: total favorites,
// distinct assets, distinct sessions, and a per-asset count breakdown
// ordered by count descending (most-loved first).
//
// Single trip with two CTEs so the dashboard tile doesn't have to issue
// three separate queries. Returns an empty summary (all zeros, empty
// ByAsset slice) when the gallery has no favorites — the dashboard tile
// renders "0" without a nil-check.
func (r *GalleryFavoritesRepo) SummarizeGallery(ctx context.Context, galleryID uuid.UUID) (*GalleryFavoritesSummary, error) {
	summary := &GalleryFavoritesSummary{
		GalleryID: galleryID,
		ByAsset:   make([]GalleryFavoriteByAsset, 0),
	}

	// Aggregate totals + per-asset counts in two queries on the same
	// indexed table. Both are cheap because gallery_id is the leading
	// index column.
	err := r.pool.QueryRow(ctx,
		`SELECT
		   COUNT(*) AS total,
		   COUNT(DISTINCT asset_id) AS uniq_assets,
		   COUNT(DISTINCT guest_session_id) AS uniq_sessions
		 FROM gallery_favorites
		 WHERE gallery_id = $1`,
		galleryID,
	).Scan(&summary.TotalFavorites, &summary.UniqueAssetsCount, &summary.UniqueSessions)
	if err != nil {
		return nil, fmt.Errorf("gallery favorites summary totals: %w", err)
	}

	if summary.TotalFavorites == 0 {
		return summary, nil
	}

	rows, err := r.pool.Query(ctx,
		`SELECT asset_id, COUNT(*) AS cnt
		 FROM gallery_favorites
		 WHERE gallery_id = $1
		 GROUP BY asset_id
		 ORDER BY cnt DESC, MIN(created_at) ASC`,
		galleryID,
	)
	if err != nil {
		return nil, fmt.Errorf("gallery favorites summary by-asset: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var row GalleryFavoriteByAsset
		if err := rows.Scan(&row.AssetID, &row.Count); err != nil {
			return nil, fmt.Errorf("gallery favorites by-asset scan: %w", err)
		}
		summary.ByAsset = append(summary.ByAsset, row)
	}
	return summary, rows.Err()
}
