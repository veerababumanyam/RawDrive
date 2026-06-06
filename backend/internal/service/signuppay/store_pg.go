package signuppay

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PgStore is the Postgres-backed OrderStore over signup_payment_orders
// (migration 174).
//
// NOTE: not runtime-verified in the build session that introduced it (no booted
// DB / payment sandbox). Covered by the migration-174 contract test and the
// signuppay orchestration unit tests; the live INSERT/SELECT path needs UAT.
type PgStore struct {
	pool *pgxpool.Pool
}

// NewPgStore constructs the store.
func NewPgStore(pool *pgxpool.Pool) *PgStore { return &PgStore{pool: pool} }

// Create inserts a pending signup payment order and returns its id.
func (s *PgStore) Create(ctx context.Context, o Order) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx,
		`INSERT INTO signup_payment_orders
		   (user_id, tier_slug, billing_interval, amount_paise, currency, provider, provider_order_id, status)
		 VALUES ($1, $2, $3, $4, 'INR', $5, $6, 'pending')
		 RETURNING id::text`,
		o.UserID, o.Tier, o.BillingInterval, o.AmountPaise, o.Provider, o.ProviderOrderID,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("signuppay store create: %w", err)
	}
	return id, nil
}

// GetByProviderOrder looks up an order by its provider order id.
func (s *PgStore) GetByProviderOrder(ctx context.Context, provider, providerOrderID string) (Order, error) {
	var o Order
	var workspaceID *string
	err := s.pool.QueryRow(ctx,
		`SELECT id::text, user_id::text, tier_slug, billing_interval, amount_paise, provider,
		        COALESCE(provider_order_id, ''), status, workspace_id::text
		   FROM signup_payment_orders
		  WHERE provider = $1 AND provider_order_id = $2`,
		provider, providerOrderID,
	).Scan(&o.ID, &o.UserID, &o.Tier, &o.BillingInterval, &o.AmountPaise, &o.Provider, &o.ProviderOrderID, &o.Status, &workspaceID)
	if err == pgx.ErrNoRows {
		return Order{}, fmt.Errorf("signuppay store: order not found")
	}
	if err != nil {
		return Order{}, fmt.Errorf("signuppay store get: %w", err)
	}
	if workspaceID != nil {
		o.WorkspaceID = *workspaceID
	}
	return o, nil
}
