//go:build integration

package credit_test

// M31 / E102-S4 — integration tests for the credit ledger.
//
// Requires a running Postgres with migrations 083-087 applied.
// Run with: go test -tags=integration ./backend/internal/streaming/credit/...

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/streaming/credit"
)

func dbPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping credit integration test")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	require.NoError(t, err)
	cfg.MaxConns = 4
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

// setupWorkspaceAndStream creates a workspace, user, and stream. Returns
// (workspaceID, streamID, packageID, cleanupFn).
func setupWorkspaceAndStream(t *testing.T, pool *pgxpool.Pool) (uuid.UUID, uuid.UUID, uuid.UUID, func()) {
	t.Helper()
	ctx := context.Background()

	var workspaceID, userID uuid.UUID
	err := pool.QueryRow(ctx, `SELECT id FROM workspaces LIMIT 1`).Scan(&workspaceID)
	if err != nil {
		t.Skipf("no workspaces: %v", err)
	}
	err = pool.QueryRow(ctx, `SELECT id FROM users LIMIT 1`).Scan(&userID)
	if err != nil {
		t.Skipf("no users: %v", err)
	}

	streamID := uuid.New()
	_, err = pool.Exec(ctx,
		`INSERT INTO streams (id, workspace_id, created_by, title, status)
		 VALUES ($1, $2, $3, 'credit-test', 'scheduled')`,
		streamID, workspaceID, userID,
	)
	require.NoError(t, err)

	var packageID uuid.UUID
	err = pool.QueryRow(ctx, `SELECT id FROM streaming_packages WHERE code='basic' LIMIT 1`).Scan(&packageID)
	require.NoError(t, err)

	cleanup := func() {
		ctx := context.Background()
		_, _ = pool.Exec(ctx, `DELETE FROM streaming_ledger_entries WHERE stream_id=$1`, streamID)
		_, _ = pool.Exec(ctx, `DELETE FROM streaming_reservations WHERE stream_id=$1`, streamID)
		_, _ = pool.Exec(ctx, `DELETE FROM streaming_ledger_entries WHERE workspace_id=$1 AND stream_id IS NULL AND entry_type='purchase' AND idempotency_key LIKE 'test-%'`, workspaceID)
		_, _ = pool.Exec(ctx, `DELETE FROM streaming_purchases WHERE workspace_id=$1 AND idempotency_key LIKE 'test-%'`, workspaceID)
		_, _ = pool.Exec(ctx, `DELETE FROM streams WHERE id=$1`, streamID)
	}
	return workspaceID, streamID, packageID, cleanup
}

// setSessionWorkspace sets the RLS workspace binding for subsequent operations.
// Returns a context bound to a single connection that stays checked out.
// The callers here operate via the pool (multiple connections), so we use
// SET (connection-scoped) on a dedicated conn and pass it through a ctx.
// For these tests we rely on the postgres role bypassing RLS — the rawdrive_user
// role in dev is superuser-equivalent in the test DB. In production the handler
// layer binds RLS before calling credit.Service.
func setSessionWorkspace(t *testing.T, pool *pgxpool.Pool, workspaceID uuid.UUID) {
	t.Helper()
	_, err := pool.Exec(context.Background(),
		`SELECT set_config('app.current_workspace_id', $1, false)`,
		workspaceID.String(),
	)
	require.NoError(t, err)
}

func TestPurchase_PostsLedgerAndIdempotent(t *testing.T) {
	pool := dbPool(t)
	workspaceID, _, packageID, cleanup := setupWorkspaceAndStream(t, pool)
	t.Cleanup(cleanup)
	setSessionWorkspace(t, pool, workspaceID)

	svc := credit.NewService(pool)
	key := "test-" + uuid.NewString()

	before, err := svc.GetBalance(context.Background(), workspaceID)
	require.NoError(t, err)

	entry1, err := svc.Purchase(context.Background(), credit.PurchaseInput{
		WorkspaceID:    workspaceID,
		PackageID:      packageID,
		IdempotencyKey: key,
		Provider:       "phonepe",
		ProviderTxnID:  "TXN-TEST-" + uuid.NewString(),
	})
	require.NoError(t, err)
	assert.Equal(t, credit.EntryPurchase, entry1.EntryType)
	assert.Equal(t, int64(49900), entry1.AmountPaise) // basic price
	assert.Equal(t, 60, entry1.MinutesDelta)          // basic minutes

	// Idempotent replay returns the same entry, no new row.
	entry2, err := svc.Purchase(context.Background(), credit.PurchaseInput{
		WorkspaceID:    workspaceID,
		PackageID:      packageID,
		IdempotencyKey: key,
	})
	require.NoError(t, err)
	assert.Equal(t, entry1.ID, entry2.ID)

	after, err := svc.GetBalance(context.Background(), workspaceID)
	require.NoError(t, err)
	assert.Equal(t, before.BalancePaise+49900, after.BalancePaise)
	assert.Equal(t, before.BalanceMinutes+60, after.BalanceMinutes)
}

func TestReserveConsume_HappyPath(t *testing.T) {
	pool := dbPool(t)
	workspaceID, streamID, packageID, cleanup := setupWorkspaceAndStream(t, pool)
	t.Cleanup(cleanup)
	setSessionWorkspace(t, pool, workspaceID)

	svc := credit.NewService(pool)
	ctx := context.Background()

	// Top up first.
	_, err := svc.Purchase(ctx, credit.PurchaseInput{
		WorkspaceID:    workspaceID,
		PackageID:      packageID,
		IdempotencyKey: "test-purchase-" + uuid.NewString(),
	})
	require.NoError(t, err)

	balAfterPurchase, _ := svc.GetBalance(ctx, workspaceID)

	// Reserve 30 minutes.
	res, err := svc.ReserveCredits(ctx, credit.ReserveInput{
		WorkspaceID:    workspaceID,
		StreamID:       streamID,
		PackageID:      packageID,
		Minutes:        30,
		IdempotencyKey: "test-reserve-" + uuid.NewString(),
	})
	require.NoError(t, err)
	assert.Equal(t, 30, res.ReservedMinutes)
	assert.Equal(t, int64(3000), res.ReservedAmountPaise) // 30 * 100
	assert.Equal(t, credit.ReservationPending, res.State)

	balAfterReserve, _ := svc.GetBalance(ctx, workspaceID)
	assert.Equal(t, balAfterPurchase.BalancePaise-3000, balAfterReserve.BalancePaise)
	assert.Equal(t, balAfterPurchase.BalanceMinutes-30, balAfterReserve.BalanceMinutes)

	// Consume within budget.
	_, err = svc.ConsumeCredits(ctx, credit.ConsumeInput{
		ReservationID:   res.ID,
		ConsumedMinutes: 25,
		IdempotencyKey:  "test-consume-" + uuid.NewString(),
	})
	require.NoError(t, err)

	balAfterConsume, _ := svc.GetBalance(ctx, workspaceID)
	// Consume is zero-amount — balance unchanged (the reserve already debited).
	assert.Equal(t, balAfterReserve.BalancePaise, balAfterConsume.BalancePaise)
}

func TestReserveRefund_RestoresBalance(t *testing.T) {
	pool := dbPool(t)
	workspaceID, streamID, packageID, cleanup := setupWorkspaceAndStream(t, pool)
	t.Cleanup(cleanup)
	setSessionWorkspace(t, pool, workspaceID)

	svc := credit.NewService(pool)
	ctx := context.Background()

	_, err := svc.Purchase(ctx, credit.PurchaseInput{
		WorkspaceID:    workspaceID,
		PackageID:      packageID,
		IdempotencyKey: "test-p-" + uuid.NewString(),
	})
	require.NoError(t, err)
	balPre, _ := svc.GetBalance(ctx, workspaceID)

	res, err := svc.ReserveCredits(ctx, credit.ReserveInput{
		WorkspaceID:    workspaceID,
		StreamID:       streamID,
		PackageID:      packageID,
		Minutes:        45,
		IdempotencyKey: "test-r-" + uuid.NewString(),
	})
	require.NoError(t, err)

	_, err = svc.RefundReservation(ctx, credit.RefundInput{
		ReservationID:  res.ID,
		IdempotencyKey: "test-refund-" + uuid.NewString(),
		Reason:         "cancelled before go-live",
	})
	require.NoError(t, err)

	balPost, _ := svc.GetBalance(ctx, workspaceID)
	assert.Equal(t, balPre.BalancePaise, balPost.BalancePaise)
	assert.Equal(t, balPre.BalanceMinutes, balPost.BalanceMinutes)
}

func TestPostOverage_ChargesAtOverageRate(t *testing.T) {
	pool := dbPool(t)
	workspaceID, streamID, packageID, cleanup := setupWorkspaceAndStream(t, pool)
	t.Cleanup(cleanup)
	setSessionWorkspace(t, pool, workspaceID)

	svc := credit.NewService(pool)
	ctx := context.Background()

	_, err := svc.Purchase(ctx, credit.PurchaseInput{
		WorkspaceID:    workspaceID,
		PackageID:      packageID,
		IdempotencyKey: "test-p-" + uuid.NewString(),
	})
	require.NoError(t, err)

	res, err := svc.ReserveCredits(ctx, credit.ReserveInput{
		WorkspaceID:    workspaceID,
		StreamID:       streamID,
		PackageID:      packageID,
		Minutes:        10,
		IdempotencyKey: "test-r-" + uuid.NewString(),
	})
	require.NoError(t, err)

	balPreOverage, _ := svc.GetBalance(ctx, workspaceID)

	// 6 overage minutes at 150 paise/min = 900 paise debit.
	entry, err := svc.PostOverage(ctx, credit.OverageInput{
		ReservationID:  res.ID,
		OverageMinutes: 6,
		IdempotencyKey: "test-over-" + uuid.NewString(),
	})
	require.NoError(t, err)
	assert.Equal(t, credit.EntryOverage, entry.EntryType)
	assert.Equal(t, int64(-900), entry.AmountPaise)
	assert.Equal(t, -6, entry.MinutesDelta)

	balPostOverage, _ := svc.GetBalance(ctx, workspaceID)
	assert.Equal(t, balPreOverage.BalancePaise-900, balPostOverage.BalancePaise)
}

func TestInsufficientBalance_Rejected(t *testing.T) {
	pool := dbPool(t)
	workspaceID, streamID, packageID, cleanup := setupWorkspaceAndStream(t, pool)
	t.Cleanup(cleanup)
	setSessionWorkspace(t, pool, workspaceID)

	svc := credit.NewService(pool)
	ctx := context.Background()

	// Without purchasing, a reserve of 999 minutes must fail.
	_, err := svc.ReserveCredits(ctx, credit.ReserveInput{
		WorkspaceID:    workspaceID,
		StreamID:       streamID,
		PackageID:      packageID,
		Minutes:        999_999,
		IdempotencyKey: "test-overreserve-" + uuid.NewString(),
		ExpiresAt:      ptrTime(time.Now().Add(time.Hour)),
	})
	assert.ErrorIs(t, err, credit.ErrInsufficient)
}

func ptrTime(t time.Time) *time.Time { return &t }
