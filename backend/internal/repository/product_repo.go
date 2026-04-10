package repository

// product_repo.go — M14 GAL-FR-155: gallery product catalog.
//
// Products represent what a client can buy from a gallery: digital
// downloads, prints, albums, or bundles. The table is defined in
// migration 042_m14_commerce_analytics_api.up.sql.
//
// Products are scoped to a gallery (for per-gallery pricing) but also
// carry the workspace_id so workspace-wide queries can filter without
// a gallery join. Price is stored in the smallest currency unit (paise
// for INR) to avoid float math.

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Valid product types.
const (
	ProductTypeDigital = "digital"
	ProductTypePrint   = "print"
	ProductTypeAlbum   = "album"
	ProductTypeBundle  = "bundle"
)

// GalleryProduct is a sellable item within a gallery.
type GalleryProduct struct {
	ID            uuid.UUID       `json:"id"`
	GalleryID     uuid.UUID       `json:"gallery_id"`
	WorkspaceID   uuid.UUID       `json:"workspace_id"`
	Name          string          `json:"name"`
	Description   string          `json:"description,omitempty"`
	ProductType   string          `json:"product_type"`
	PriceAmount   int             `json:"price_amount"`
	PriceCurrency string          `json:"price_currency"`
	AssetID       *uuid.UUID      `json:"asset_id,omitempty"`
	Config        json.RawMessage `json:"config"`
	IsActive      bool            `json:"is_active"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

// ProductRepo handles gallery_products persistence.
type ProductRepo struct {
	pool *pgxpool.Pool
}

// NewProductRepo creates a new ProductRepo.
func NewProductRepo(pool *pgxpool.Pool) *ProductRepo {
	return &ProductRepo{pool: pool}
}

// Create inserts a new product. ID and timestamps are set if blank.
func (r *ProductRepo) Create(ctx context.Context, p *GalleryProduct) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	now := time.Now().UTC()
	if p.CreatedAt.IsZero() {
		p.CreatedAt = now
	}
	p.UpdatedAt = now
	if p.PriceCurrency == "" {
		p.PriceCurrency = "INR"
	}
	if len(p.Config) == 0 {
		p.Config = json.RawMessage("{}")
	}
	_, err := r.pool.Exec(ctx,
		`INSERT INTO gallery_products
		   (id, gallery_id, workspace_id, name, description, product_type,
		    price_amount, price_currency, asset_id, config, is_active,
		    created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		p.ID, p.GalleryID, p.WorkspaceID, p.Name, p.Description, p.ProductType,
		p.PriceAmount, p.PriceCurrency, p.AssetID, p.Config, p.IsActive,
		p.CreatedAt, p.UpdatedAt)
	if err != nil {
		return fmt.Errorf("product repo create: %w", err)
	}
	return nil
}

// GetByID returns a single product, or (nil, nil) if not found.
func (r *ProductRepo) GetByID(ctx context.Context, id uuid.UUID) (*GalleryProduct, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, gallery_id, workspace_id, name, description, product_type,
		        price_amount, price_currency, asset_id, config, is_active,
		        created_at, updated_at
		 FROM gallery_products WHERE id = $1`, id)
	p := &GalleryProduct{}
	err := row.Scan(&p.ID, &p.GalleryID, &p.WorkspaceID, &p.Name, &p.Description,
		&p.ProductType, &p.PriceAmount, &p.PriceCurrency, &p.AssetID, &p.Config,
		&p.IsActive, &p.CreatedAt, &p.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("product repo get: %w", err)
	}
	return p, nil
}

// ListByGallery returns active products for a gallery.
func (r *ProductRepo) ListByGallery(ctx context.Context, galleryID uuid.UUID) ([]GalleryProduct, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, workspace_id, name, description, product_type,
		        price_amount, price_currency, asset_id, config, is_active,
		        created_at, updated_at
		 FROM gallery_products
		 WHERE gallery_id = $1 AND is_active = true
		 ORDER BY created_at ASC`, galleryID)
	if err != nil {
		return nil, fmt.Errorf("product repo list: %w", err)
	}
	defer rows.Close()

	products := make([]GalleryProduct, 0)
	for rows.Next() {
		p := GalleryProduct{}
		if err := rows.Scan(&p.ID, &p.GalleryID, &p.WorkspaceID, &p.Name,
			&p.Description, &p.ProductType, &p.PriceAmount, &p.PriceCurrency,
			&p.AssetID, &p.Config, &p.IsActive, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("product repo scan: %w", err)
		}
		products = append(products, p)
	}
	return products, rows.Err()
}

// Update updates name, description, price, config, and is_active.
func (r *ProductRepo) Update(ctx context.Context, p *GalleryProduct) error {
	p.UpdatedAt = time.Now().UTC()
	if len(p.Config) == 0 {
		p.Config = json.RawMessage("{}")
	}
	_, err := r.pool.Exec(ctx,
		`UPDATE gallery_products
		 SET name=$2, description=$3, price_amount=$4, price_currency=$5,
		     config=$6, is_active=$7, updated_at=$8
		 WHERE id=$1`,
		p.ID, p.Name, p.Description, p.PriceAmount, p.PriceCurrency,
		p.Config, p.IsActive, p.UpdatedAt)
	if err != nil {
		return fmt.Errorf("product repo update: %w", err)
	}
	return nil
}

// Delete marks a product inactive (soft delete).
func (r *ProductRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE gallery_products SET is_active=false, updated_at=now() WHERE id=$1`, id)
	if err != nil {
		return fmt.Errorf("product repo delete: %w", err)
	}
	return nil
}
