package repository

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// incrementRedemptionFakeTx is a minimal pgx.Tx used to drive
// IncrementRedemption without a real database. Only Exec is exercised by that
// method; every other pgx.Tx method is inherited from the embedded nil
// interface and will panic if called, which keeps the fake honest — the test
// fails loudly if IncrementRedemption ever touches an unexpected method.
type incrementRedemptionFakeTx struct {
	pgx.Tx // embedded interface (nil); only Exec is overridden below

	// commandTag is returned from Exec to simulate how many rows the guarded
	// UPDATE matched. "UPDATE 1" => RowsAffected()==1 (increment applied),
	// "UPDATE 0" => RowsAffected()==0 (cap already reached).
	commandTag string
	execErr    error

	calls int
}

func (f *incrementRedemptionFakeTx) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	f.calls++
	if f.execErr != nil {
		return pgconn.CommandTag{}, f.execErr
	}
	return pgconn.NewCommandTag(f.commandTag), nil
}

// TestIncrementRedemption_ExhaustedWhenNoRowMatched is the regression test for
// F-015: when the guarded UPDATE matches no row (redemption_count has already
// reached max_redemptions), IncrementRedemption must report ErrCouponExhausted
// instead of silently succeeding. Before the fix the UPDATE had no
// max_redemptions guard and no rows-affected check, so concurrent redemptions
// could both succeed and push the count past the cap.
func TestIncrementRedemption_ExhaustedWhenNoRowMatched(t *testing.T) {
	repo := &CouponRepo{}
	tx := &incrementRedemptionFakeTx{commandTag: "UPDATE 0"}

	err := repo.IncrementRedemption(context.Background(), tx, uuid.New())

	if !errors.Is(err, ErrCouponExhausted) {
		t.Fatalf("expected ErrCouponExhausted when no row matched, got %v", err)
	}
	if tx.calls != 1 {
		t.Fatalf("expected exactly one Exec call, got %d", tx.calls)
	}
}

// TestIncrementRedemption_SuccessWhenRowMatched verifies the happy path: a
// matched row (under the cap) increments cleanly with no error.
func TestIncrementRedemption_SuccessWhenRowMatched(t *testing.T) {
	repo := &CouponRepo{}
	tx := &incrementRedemptionFakeTx{commandTag: "UPDATE 1"}

	err := repo.IncrementRedemption(context.Background(), tx, uuid.New())

	if err != nil {
		t.Fatalf("expected nil error when a row matched, got %v", err)
	}
}

// TestIncrementRedemption_PropagatesExecError ensures a real DB error is
// surfaced verbatim and is not masked as ErrCouponExhausted.
func TestIncrementRedemption_PropagatesExecError(t *testing.T) {
	repo := &CouponRepo{}
	sentinel := errors.New("boom")
	tx := &incrementRedemptionFakeTx{execErr: sentinel}

	err := repo.IncrementRedemption(context.Background(), tx, uuid.New())

	if !errors.Is(err, sentinel) {
		t.Fatalf("expected underlying exec error to propagate, got %v", err)
	}
	if errors.Is(err, ErrCouponExhausted) {
		t.Fatalf("exec error must not be reported as ErrCouponExhausted")
	}
}
