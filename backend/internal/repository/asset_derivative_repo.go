package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AssetDerivative represents a generated variant of an asset (thumbnail, cover, OG image).
type AssetDerivative struct {
	ID                uuid.UUID              `json:"id"`
	AssetID           uuid.UUID              `json:"asset_id"`
	Variant           string                 `json:"variant"`
	StorageKey        string                 `json:"storage_key"`
	Width             int                    `json:"width"`
	Height            int                    `json:"height"`
	SizeBytes         int64                  `json:"size_bytes"`
	Format            string                 `json:"format"`
	IsEncrypted       bool                   `json:"is_encrypted"`
	EncryptionAlgo    *string                `json:"encryption_algo,omitempty"`
	EncryptionVersion int                    `json:"encryption_version"`
	MediaEncryption   map[string]interface{} `json:"media_encryption,omitempty"`
	CreatedAt         time.Time              `json:"created_at"`
}

// AssetDerivativeRepo handles derivative persistence.
type AssetDerivativeRepo struct {
	pool *pgxpool.Pool
}

// NewAssetDerivativeRepo creates a new AssetDerivativeRepo.
func NewAssetDerivativeRepo(pool *pgxpool.Pool) *AssetDerivativeRepo {
	return &AssetDerivativeRepo{pool: pool}
}

// Upsert inserts or updates a derivative (unique on asset_id + variant).
func (r *AssetDerivativeRepo) Upsert(ctx context.Context, d *AssetDerivative) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	d.CreatedAt = time.Now()

	_, err := r.pool.Exec(ctx,
		`INSERT INTO asset_derivatives (id, asset_id, variant, storage_key, width, height, size_bytes, format, is_encrypted, encryption_algo, encryption_version, media_encryption, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		 ON CONFLICT (asset_id, variant) DO UPDATE
		 SET storage_key = $4, width = $5, height = $6, size_bytes = $7, format = $8,
		     is_encrypted = $9, encryption_algo = $10, encryption_version = $11,
		     media_encryption = $12, created_at = $13`,
		d.ID, d.AssetID, d.Variant, d.StorageKey, d.Width, d.Height, d.SizeBytes, d.Format,
		d.IsEncrypted, d.EncryptionAlgo, d.EncryptionVersion, jsonMapOrEmpty(d.MediaEncryption), d.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("derivative upsert: %w", err)
	}
	return nil
}

// ListByAsset returns all derivatives for an asset.
func (r *AssetDerivativeRepo) ListByAsset(ctx context.Context, assetID uuid.UUID) ([]AssetDerivative, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, asset_id, variant, storage_key, width, height, size_bytes, format, is_encrypted, encryption_algo, encryption_version, media_encryption, created_at
		 FROM asset_derivatives WHERE asset_id = $1 ORDER BY variant`, assetID,
	)
	if err != nil {
		return nil, fmt.Errorf("derivative list: %w", err)
	}
	defer rows.Close()

	var derivs []AssetDerivative
	for rows.Next() {
		var d AssetDerivative
		if err := rows.Scan(&d.ID, &d.AssetID, &d.Variant, &d.StorageKey, &d.Width, &d.Height, &d.SizeBytes, &d.Format, &d.IsEncrypted, &d.EncryptionAlgo, &d.EncryptionVersion, &d.MediaEncryption, &d.CreatedAt); err != nil {
			return nil, fmt.Errorf("derivative scan: %w", err)
		}
		derivs = append(derivs, d)
	}
	return derivs, rows.Err()
}

// GetByVariant returns a specific derivative variant for an asset.
func (r *AssetDerivativeRepo) GetByVariant(ctx context.Context, assetID uuid.UUID, variant string) (*AssetDerivative, error) {
	d := &AssetDerivative{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, asset_id, variant, storage_key, width, height, size_bytes, format, is_encrypted, encryption_algo, encryption_version, media_encryption, created_at
		 FROM asset_derivatives WHERE asset_id = $1 AND variant = $2`,
		assetID, variant,
	).Scan(&d.ID, &d.AssetID, &d.Variant, &d.StorageKey, &d.Width, &d.Height, &d.SizeBytes, &d.Format, &d.IsEncrypted, &d.EncryptionAlgo, &d.EncryptionVersion, &d.MediaEncryption, &d.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("derivative get: %w", err)
	}
	return d, nil
}

// DeleteByAsset removes all derivatives for an asset.
func (r *AssetDerivativeRepo) DeleteByAsset(ctx context.Context, assetID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM asset_derivatives WHERE asset_id = $1`, assetID)
	if err != nil {
		return fmt.Errorf("derivative delete: %w", err)
	}
	return nil
}

// TotalSizeByAsset returns the total derivative storage for an asset.
func (r *AssetDerivativeRepo) TotalSizeByAsset(ctx context.Context, assetID uuid.UUID) (int64, error) {
	var total int64
	err := r.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(size_bytes), 0) FROM asset_derivatives WHERE asset_id = $1`, assetID,
	).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("derivative total size: %w", err)
	}
	return total, nil
}
