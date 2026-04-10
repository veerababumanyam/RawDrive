package repository

// order_repo.go — M14 GAL-FR-159: gallery_orders persistence.
//
// Orders are created when a client checks out (normal purchase) or
// when a proofing session is finalized (proofing-to-fulfillment bridge).
// The table has payment_status and fulfillment_status columns that
// move through their own state machines:
//
//   payment_status:     pending → paid → refunded
//   fulfillment_status: pending → processing → shipped → delivered
//
// This repo provides the minimum surface the cart checkout and the
// proofing bridge need: Create, GetByID, ListByGallery.

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GalleryOrder is a row in gallery_orders.
type GalleryOrder struct {
	ID                uuid.UUID       `json:"id"`
	GalleryID         uuid.UUID       `json:"gallery_id"`
	WorkspaceID       uuid.UUID       `json:"workspace_id"`
	CartID            *uuid.UUID      `json:"cart_id,omitempty"`
	ClientName        string          `json:"client_name"`
	ClientEmail       string          `json:"client_email"`
	Items             json.RawMessage `json:"items"`
	Subtotal          int             `json:"subtotal"`
	Discount          int             `json:"discount"`
	Total             int             `json:"total"`
	PaymentStatus     string          `json:"payment_status"`
	PaymentID         string          `json:"payment_id,omitempty"`
	FulfillmentStatus string          `json:"fulfillment_status"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

// OrderRepo handles gallery_orders persistence.
type OrderRepo struct {
	pool *pgxpool.Pool
}

// NewOrderRepo creates a new OrderRepo.
func NewOrderRepo(pool *pgxpool.Pool) *OrderRepo {
	return &OrderRepo{pool: pool}
}

// Create inserts a new order.
func (r *OrderRepo) Create(ctx context.Context, o *GalleryOrder) error {
	if o.ID == uuid.Nil {
		o.ID = uuid.New()
	}
	now := time.Now().UTC()
	if o.CreatedAt.IsZero() {
		o.CreatedAt = now
	}
	o.UpdatedAt = now
	if o.PaymentStatus == "" {
		o.PaymentStatus = "pending"
	}
	if o.FulfillmentStatus == "" {
		o.FulfillmentStatus = "pending"
	}
	if len(o.Items) == 0 {
		o.Items = json.RawMessage("[]")
	}
	_, err := r.pool.Exec(ctx,
		`INSERT INTO gallery_orders
		   (id, gallery_id, workspace_id, cart_id, client_name, client_email,
		    items, subtotal, discount, total, payment_status, payment_id,
		    fulfillment_status, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
		o.ID, o.GalleryID, o.WorkspaceID, o.CartID, o.ClientName, o.ClientEmail,
		o.Items, o.Subtotal, o.Discount, o.Total, o.PaymentStatus, o.PaymentID,
		o.FulfillmentStatus, o.CreatedAt, o.UpdatedAt)
	if err != nil {
		return fmt.Errorf("order repo create: %w", err)
	}
	return nil
}

// GetByID returns one order, or (nil, nil) if not found.
func (r *OrderRepo) GetByID(ctx context.Context, id uuid.UUID) (*GalleryOrder, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, gallery_id, workspace_id, cart_id, client_name, client_email,
		        items, subtotal, discount, total, payment_status, payment_id,
		        fulfillment_status, created_at, updated_at
		 FROM gallery_orders WHERE id=$1`, id)
	o := &GalleryOrder{}
	err := row.Scan(&o.ID, &o.GalleryID, &o.WorkspaceID, &o.CartID, &o.ClientName,
		&o.ClientEmail, &o.Items, &o.Subtotal, &o.Discount, &o.Total,
		&o.PaymentStatus, &o.PaymentID, &o.FulfillmentStatus, &o.CreatedAt, &o.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("order repo get: %w", err)
	}
	return o, nil
}

// ListByGallery returns the most recent N orders for a gallery.
func (r *OrderRepo) ListByGallery(ctx context.Context, galleryID uuid.UUID, limit int) ([]GalleryOrder, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, workspace_id, cart_id, client_name, client_email,
		        items, subtotal, discount, total, payment_status, payment_id,
		        fulfillment_status, created_at, updated_at
		 FROM gallery_orders
		 WHERE gallery_id=$1
		 ORDER BY created_at DESC
		 LIMIT $2`, galleryID, limit)
	if err != nil {
		return nil, fmt.Errorf("order repo list: %w", err)
	}
	defer rows.Close()
	orders := make([]GalleryOrder, 0)
	for rows.Next() {
		o := GalleryOrder{}
		if err := rows.Scan(&o.ID, &o.GalleryID, &o.WorkspaceID, &o.CartID,
			&o.ClientName, &o.ClientEmail, &o.Items, &o.Subtotal, &o.Discount,
			&o.Total, &o.PaymentStatus, &o.PaymentID, &o.FulfillmentStatus,
			&o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, fmt.Errorf("order repo scan: %w", err)
		}
		orders = append(orders, o)
	}
	return orders, rows.Err()
}
