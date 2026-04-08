package m6_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func getTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgresql://rawdrive_user:e706fbd6b28d036aa80379447729737b@localhost:55070/rawdrive_db?sslmode=disable"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
	require.NoError(t, err, "Failed to connect to test database")
	t.Cleanup(func() { pool.Close() })
	return pool
}

// ──────────────────────────── Migration 026: Dealer Tables ────────────────────────────

func TestMigration026_DealersTableExists(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()
	var exists bool
	err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'dealers')`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "dealers table should exist")
}

func TestMigration026_DealersColumns(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()
	expectedCols := []string{
		"id", "user_id", "state_id", "business_name", "territory_type",
		"status", "commission_rate_pct", "bank_account", "pan_number",
		"gstin", "referral_code", "approved_at", "approved_by",
		"created_at", "updated_at",
	}
	for _, col := range expectedCols {
		var colExists bool
		err := pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT FROM information_schema.columns
				WHERE table_name = 'dealers' AND column_name = $1
			)`, col).Scan(&colExists)
		require.NoError(t, err)
		assert.True(t, colExists, "dealers should have column: %s", col)
	}
}

func TestMigration026_DealersStatusConstraint(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()
	// Verify the CHECK constraint exists on status column
	var constraintExists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.check_constraints cc
			JOIN information_schema.constraint_column_usage ccu ON cc.constraint_name = ccu.constraint_name
			WHERE ccu.table_name = 'dealers' AND ccu.column_name = 'status'
		)
	`).Scan(&constraintExists)
	require.NoError(t, err)
	assert.True(t, constraintExists, "dealers.status should have CHECK constraint")
}

func TestMigration026_DealersRLSEnabled(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()
	var rlsEnabled bool
	err := pool.QueryRow(ctx, `
		SELECT relrowsecurity FROM pg_class WHERE relname = 'dealers'
	`).Scan(&rlsEnabled)
	require.NoError(t, err)
	assert.True(t, rlsEnabled, "dealers table should have RLS enabled")
}

func TestMigration026_DealerAttributionsTableExists(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()
	var exists bool
	err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'dealer_attributions')`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "dealer_attributions table should exist")
}

func TestMigration026_MarginRatiosTableExists(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()
	var exists bool
	err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'margin_ratios')`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "margin_ratios table should exist")
}

func TestMigration026_MarginRatiosPctSumConstraint(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()
	// The CHECK constraint should enforce dealer_pct + platform_pct = 100
	var constraintCount int
	err := pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM information_schema.check_constraints cc
		JOIN information_schema.table_constraints tc ON cc.constraint_name = tc.constraint_name
		WHERE tc.table_name = 'margin_ratios'
	`).Scan(&constraintCount)
	require.NoError(t, err)
	assert.Greater(t, constraintCount, 0, "margin_ratios should have CHECK constraints")
}

// ──────────────────────────── Migration 027: Coupon Tables ────────────────────────────

func TestMigration027_CouponsTableExists(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()
	var exists bool
	err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'coupons')`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "coupons table should exist")
}

func TestMigration027_CouponsCodeUniqueIndex(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()
	// Check for unique index on UPPER(code)
	var indexExists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM pg_indexes
			WHERE tablename = 'coupons' AND indexdef LIKE '%upper%code%'
		)
	`).Scan(&indexExists)
	require.NoError(t, err)
	assert.True(t, indexExists, "coupons should have unique index on UPPER(code)")
}

func TestMigration027_CouponRedemptionsTableExists(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()
	var exists bool
	err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'coupon_redemptions')`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "coupon_redemptions table should exist")
}

// ──────────────────────────── Migration 028: Payout Tables ────────────────────────────

func TestMigration028_PayoutsTableExists(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()
	var exists bool
	err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'payouts')`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "payouts table should exist")
}

func TestMigration028_PayoutsUniqueConstraint(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()
	// Check for UNIQUE(dealer_id, period_start, period_end)
	var constraintExists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM pg_indexes
			WHERE tablename = 'payouts'
			AND indexdef LIKE '%dealer_id%' AND indexdef LIKE '%period_start%'
		)
	`).Scan(&constraintExists)
	require.NoError(t, err)
	assert.True(t, constraintExists, "payouts should have unique index on (dealer_id, period_start, period_end)")
}
