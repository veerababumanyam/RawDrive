package repository

// cart_repo.go — M14 GAL-FR-158: persistent gallery shopping cart.
//
// Carts are scoped to (gallery_id, client_email) so an anonymous client
// can return to the same gallery later and see their saved items. The
// cart stores a JSONB `items` array where each item references a
// product_id plus a quantity and optional customization payload.
//
// Pricing is recomputed server-side on every mutation — never trust
// client-supplied subtotals.

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CartItem is a single line in a gallery_carts.items JSONB array.
type CartItem struct {
	ProductID     uuid.UUID       `json:"product_id"`
	Quantity      int             `json:"quantity"`
	UnitPrice     int             `json:"unit_price"`
	LineTotal     int             `json:"line_total"`
	Customization json.RawMessage `json:"customization,omitempty"`
}

// GalleryCart is a persistent shopping cart for a gallery visitor.
type GalleryCart struct {
	ID          uuid.UUID  `json:"id"`
	GalleryID   uuid.UUID  `json:"gallery_id"`
	ClientEmail string     `json:"client_email"`
	Items       []CartItem `json:"items"`
	CouponCode  string     `json:"coupon_code,omitempty"`
	Subtotal    int        `json:"subtotal"`
	Discount    int        `json:"discount"`
	Total       int        `json:"total"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// CartRepo handles gallery_carts persistence.
type CartRepo struct {
	pool *pgxpool.Pool
}

// NewCartRepo creates a new CartRepo.
func NewCartRepo(pool *pgxpool.Pool) *CartRepo {
	return &CartRepo{pool: pool}
}

// Upsert inserts or updates a cart for (gallery_id, client_email).
func (r *CartRepo) Upsert(ctx context.Context, c *GalleryCart) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	now := time.Now().UTC()
	if c.CreatedAt.IsZero() {
		c.CreatedAt = now
	}
	c.UpdatedAt = now

	itemsJSON, err := json.Marshal(c.Items)
	if err != nil {
		return fmt.Errorf("cart repo marshal items: %w", err)
	}

	_, err = r.pool.Exec(ctx,
		`INSERT INTO gallery_carts
		   (id, gallery_id, client_email, items, coupon_code, subtotal,
		    discount, total, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		 ON CONFLICT (gallery_id, client_email) DO UPDATE SET
		   items      = EXCLUDED.items,
		   coupon_code= EXCLUDED.coupon_code,
		   subtotal   = EXCLUDED.subtotal,
		   discount   = EXCLUDED.discount,
		   total      = EXCLUDED.total,
		   updated_at = EXCLUDED.updated_at`,
		c.ID, c.GalleryID, c.ClientEmail, itemsJSON, c.CouponCode,
		c.Subtotal, c.Discount, c.Total, c.CreatedAt, c.UpdatedAt)
	if err != nil {
		return fmt.Errorf("cart repo upsert: %w", err)
	}
	return nil
}

// Get returns the cart for (gallery_id, client_email), or nil if none.
func (r *CartRepo) Get(ctx context.Context, galleryID uuid.UUID, clientEmail string) (*GalleryCart, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, gallery_id, client_email, items, coupon_code, subtotal,
		        discount, total, created_at, updated_at
		 FROM gallery_carts
		 WHERE gallery_id=$1 AND client_email=$2`, galleryID, clientEmail)
	c := &GalleryCart{}
	var itemsJSON []byte
	err := row.Scan(&c.ID, &c.GalleryID, &c.ClientEmail, &itemsJSON,
		&c.CouponCode, &c.Subtotal, &c.Discount, &c.Total,
		&c.CreatedAt, &c.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("cart repo get: %w", err)
	}
	if len(itemsJSON) > 0 {
		if err := json.Unmarshal(itemsJSON, &c.Items); err != nil {
			return nil, fmt.Errorf("cart repo unmarshal items: %w", err)
		}
	}
	return c, nil
}

// Delete removes a cart (e.g. after checkout).
func (r *CartRepo) Delete(ctx context.Context, galleryID uuid.UUID, clientEmail string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM gallery_carts WHERE gallery_id=$1 AND client_email=$2`,
		galleryID, clientEmail)
	if err != nil {
		return fmt.Errorf("cart repo delete: %w", err)
	}
	return nil
}
