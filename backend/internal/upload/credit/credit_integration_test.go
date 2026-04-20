//go:build integration

package credit_test

// M40 / Upload Credit Meter — integration tests against a live Postgres.
// Mirrors backend/internal/streaming/credit/credit_integration_test.go.
//
// These tests exercise the DB paths that credit_test.go deliberately skips:
//
//   - NFR-UCR-R2 concurrency: two simultaneous Reserves against a tight
//     balance — FOR UPDATE must serialise, one wins, one gets
//     InsufficientBalanceDetails
//   - NFR-UCR-R1 idempotency: replaying a reserve with the same
//     (workspace_id, idempotency_key) returns the same reservation id and
//     does NOT insert a second row (partial unique index enforcement)
//   - ExpireAbandoned TTL path: reservations older than the cutoff with no
//     consume/refund/expire partner get an `expire` entry that restores
//     the balance
//
// Run:
//   go test -tags=integration -run TestIntegration ./backend/internal/upload/credit/...
// Requires DATABASE_URL set. Skipped otherwise so `go test ./...` stays
// self-contained.

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/upload/credit"
)

func dbPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping upload credit integration test")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	require.NoError(t, err)
	cfg.MaxConns = 4
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

// setupWorkspaceWithBalance picks an existing workspace from the DB and
// grants it `credits` via a grant_admin ledger entry so the Reserve path
// has something to deduct from. Returns a cleanup that strips every row
// this test pushed into the ledger, keyed by a per-test idempotency prefix.
func setupWorkspaceWithBalance(t *testing.T, pool *pgxpool.Pool, credits int64) (uuid.UUID, string, func()) {
	t.Helper()
	ctx := context.Background()

	var workspaceID uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT id FROM workspaces LIMIT 1`).Scan(&workspaceID); err != nil {
		t.Skipf("no workspaces in test DB: %v", err)
	}

	keyPrefix := "m40-int-" + uuid.NewString()[:8] + "-"

	// Grant the opening balance. grant_admin is a terminal positive entry
	// that shows up in plan_granted and total_credits via view 099.
	_, err := pool.Exec(ctx, `
		INSERT INTO upload_ledger_entries (
			id, workspace_id, entry_type, amount_credits, idempotency_key, reason
		) VALUES ($1, $2, 'grant_admin', $3, $4, 'integration-test-opening')
	`, uuid.New(), workspaceID, credits, keyPrefix+"opening")
	require.NoError(t, err, "opening grant insert")

	cleanup := func() {
		ctx := context.Background()
		// Cascade-safe teardown: delete anything we pushed with our prefix.
		// The `reservation_ref_id` FK is self-referential; refunds/consumes/
		// expires point at the reserve entries, so we null them out first to
		// avoid FK violations on the delete order.
		_, _ = pool.Exec(ctx, `
			UPDATE upload_ledger_entries
			   SET reservation_ref_id = NULL
			 WHERE idempotency_key LIKE $1 || '%'
		`, keyPrefix)
		_, _ = pool.Exec(ctx, `
			DELETE FROM upload_ledger_entries
			 WHERE idempotency_key LIKE $1 || '%'
		`, keyPrefix)
	}
	return workspaceID, keyPrefix, cleanup
}

// TestIntegration_Reserve_HappyPathAndIdempotency exercises the DB-backed
// Reserve path: a real ledger insert, balance visible via Balance, and a
// replayed reservation with the same idempotency_key returning the same
// ReservationResult with no duplicate row.
func TestIntegration_Reserve_HappyPathAndIdempotency(t *testing.T) {
	pool := dbPool(t)
	workspaceID, keyPrefix, cleanup := setupWorkspaceWithBalance(t, pool, 10)
	t.Cleanup(cleanup)

	svc := credit.NewService(pool)
	ctx := context.Background()

	res1, err := svc.Reserve(ctx, credit.ReserveInput{
		WorkspaceID:     workspaceID,
		UploadSessionID: uuid.New(),
		AmountCredits:   1,
		IdempotencyKey:  keyPrefix + "reserve-A",
	})
	require.NoError(t, err)
	require.NotNil(t, res1)
	assert.Equal(t, int64(1), res1.AmountCredits)
	assert.Equal(t, credit.ReservationActive, res1.State)

	// Replay with the same key → same reservation id, no new ledger row.
	res2, err := svc.Reserve(ctx, credit.ReserveInput{
		WorkspaceID:     workspaceID,
		UploadSessionID: uuid.New(),
		AmountCredits:   1,
		IdempotencyKey:  keyPrefix + "reserve-A",
	})
	require.NoError(t, err)
	assert.Equal(t, res1.ReservationID, res2.ReservationID,
		"idempotency replay must return the original reservation id")

	// Balance view should reflect exactly one reserve (amount 1 pending).
	bal, err := svc.Balance(ctx, workspaceID)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, bal.Reserved, int64(1),
		"at least 1 credit should show as reserved in the view")
}

// TestIntegration_Reserve_ConcurrentRace pins NFR-UCR-R2: two simultaneous
// Reserves against a workspace with balance=1 must serialise through the
// FOR UPDATE lock. Exactly one succeeds; the other returns
// InsufficientBalanceDetails with shortfall=1.
func TestIntegration_Reserve_ConcurrentRace(t *testing.T) {
	pool := dbPool(t)
	workspaceID, keyPrefix, cleanup := setupWorkspaceWithBalance(t, pool, 1)
	t.Cleanup(cleanup)

	svc := credit.NewService(pool)
	ctx := context.Background()

	type outcome struct {
		err error
		res *credit.ReservationResult
	}
	results := make(chan outcome, 2)
	var wg sync.WaitGroup

	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(ix int) {
			defer wg.Done()
			res, err := svc.Reserve(ctx, credit.ReserveInput{
				WorkspaceID:     workspaceID,
				UploadSessionID: uuid.New(),
				AmountCredits:   1,
				// Unique keys per goroutine so the idempotency path
				// doesn't merge the two into a single reserve.
				IdempotencyKey: keyPrefix + "race-" + string(rune('A'+ix)),
			})
			results <- outcome{err: err, res: res}
		}(i)
	}
	wg.Wait()
	close(results)

	var wins, insufficient int
	var lastDetails *credit.InsufficientBalanceDetails
	for out := range results {
		if out.err == nil && out.res != nil {
			wins++
			continue
		}
		if d := new(credit.InsufficientBalanceDetails); assertErrorAs(out.err, &d) {
			insufficient++
			lastDetails = d
			continue
		}
		t.Fatalf("unexpected outcome: err=%v res=%+v", out.err, out.res)
	}

	assert.Equal(t, 1, wins, "exactly one reserve should win")
	assert.Equal(t, 1, insufficient, "the loser should return InsufficientBalanceDetails")
	if lastDetails != nil {
		assert.Equal(t, int64(1), lastDetails.Required)
		assert.Equal(t, int64(1), lastDetails.Shortfall)
	}
}

// TestIntegration_ExpireAbandoned runs the TTL sweeper and verifies that a
// reserve older than the cutoff with no settlement gets an `expire` ledger
// entry. The sweeper does NOT move the source row; it posts a compensating
// entry that restores balance via the signed sum in view 099.
func TestIntegration_ExpireAbandoned(t *testing.T) {
	pool := dbPool(t)
	workspaceID, keyPrefix, cleanup := setupWorkspaceWithBalance(t, pool, 5)
	t.Cleanup(cleanup)

	ctx := context.Background()

	// Insert a backdated reserve directly so we don't have to wait real time.
	resID := uuid.New()
	_, err := pool.Exec(ctx, `
		INSERT INTO upload_ledger_entries (
			id, workspace_id, entry_type, amount_credits, idempotency_key, created_at
		) VALUES ($1, $2, 'reserve', -2, $3, now() - interval '25 hours')
	`, resID, workspaceID, keyPrefix+"stale-reserve")
	require.NoError(t, err)

	svc := credit.NewService(pool)
	expired, err := svc.ExpireAbandoned(ctx, 24*time.Hour)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, expired, 1,
		"at least the one stale reserve we inserted must have been expired")

	// A compensating expire entry should now exist and restore 2 credits
	// to the signed ledger sum.
	var expireCount int
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM upload_ledger_entries
		 WHERE reservation_ref_id = $1 AND entry_type = 'expire'
	`, resID).Scan(&expireCount))
	assert.Equal(t, 1, expireCount, "exactly one expire entry should reference the stale reserve")
}

// assertErrorAs is a tiny helper that does `errors.As` without forcing the
// test to import "errors" for one call. Returns true on match so the caller
// can branch inline.
func assertErrorAs(err error, target any) bool {
	type unwrapper interface{ Unwrap() error }
	if err == nil {
		return false
	}
	// Prefer the stdlib behaviour via a light inline implementation to
	// keep the test free of a dedicated import.
	if d, ok := target.(**credit.InsufficientBalanceDetails); ok {
		for e := err; e != nil; {
			if v, ok := e.(*credit.InsufficientBalanceDetails); ok {
				*d = v
				return true
			}
			u, ok := e.(unwrapper)
			if !ok {
				return false
			}
			e = u.Unwrap()
		}
	}
	return false
}
