package dbretry

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// safeToRetryErr is a faithful stand-in for a transient connection error: pgx's
// connect/timeout/pool-bounce errors implement the SafeToRetry() bool interface
// that pgconn.SafeToRetry inspects. A bare io.EOF does NOT implement it (and is
// deliberately not blindly retried), so the test uses this instead.
type safeToRetryErr struct{}

func (safeToRetryErr) Error() string     { return "transient connection error" }
func (safeToRetryErr) SafeToRetry() bool { return true }

// fastOpts is a deterministic, near-instant retry policy for unit tests:
// enough attempts to prove retry behaviour without slowing the suite, and a
// floor/cap backoff in the microsecond range so the test does not sleep.
func fastOpts() Options {
	return Options{
		MaxAttempts: 5,
		BaseDelay:   time.Microsecond,
		MaxDelay:    10 * time.Microsecond,
		// Deterministic jitter for tests — no randomness in the asserted path.
		jitter: func(d time.Duration) time.Duration { return d },
	}
}

func pgErr(code string) error {
	return &pgconn.PgError{Code: code}
}

// TestDo_RetriesSerializationFailureThenSucceeds is the core RED→GREEN case:
// a transient 40001 (serialization_failure) returned twice, then success. The
// helper must retry and ultimately return nil, and the closure must have been
// invoked exactly 3 times (2 failures + 1 success).
func TestDo_RetriesSerializationFailureThenSucceeds(t *testing.T) {
	attempts := 0
	err := Do(context.Background(), fastOpts(), func() error {
		attempts++
		if attempts <= 2 {
			return pgErr("40001") // serialization_failure
		}
		return nil
	})
	if err != nil {
		t.Fatalf("expected success after transient retries, got %v", err)
	}
	if attempts != 3 {
		t.Fatalf("expected 3 attempts (2 transient + 1 success), got %d", attempts)
	}
}

// TestDo_RetriesDeadlock verifies 40P01 (deadlock_detected) is also retryable.
func TestDo_RetriesDeadlock(t *testing.T) {
	attempts := 0
	err := Do(context.Background(), fastOpts(), func() error {
		attempts++
		if attempts == 1 {
			return pgErr("40P01") // deadlock_detected
		}
		return nil
	})
	if err != nil {
		t.Fatalf("expected success after deadlock retry, got %v", err)
	}
	if attempts != 2 {
		t.Fatalf("expected 2 attempts, got %d", attempts)
	}
}

// TestDo_DoesNotRetryNonRetryable is the load-bearing safety assertion: a
// non-retryable error (here a unique-violation 23505, standing in for any
// constraint/business error) must return IMMEDIATELY without a second attempt.
// Retrying a constraint/business failure would be incorrect (e.g. double-apply
// risk, masking a real validation error).
func TestDo_DoesNotRetryNonRetryable(t *testing.T) {
	attempts := 0
	want := pgErr("23505") // unique_violation — NOT retryable
	err := Do(context.Background(), fastOpts(), func() error {
		attempts++
		return want
	})
	if !errors.Is(err, want) {
		t.Fatalf("expected the original non-retryable error to surface, got %v", err)
	}
	if attempts != 1 {
		t.Fatalf("non-retryable error must NOT be retried: expected 1 attempt, got %d", attempts)
	}
}

// TestDo_DoesNotRetrySentinelBusinessError verifies a plain (non-pg) business
// sentinel error is treated as non-retryable and surfaces on the first try.
func TestDo_DoesNotRetrySentinelBusinessError(t *testing.T) {
	attempts := 0
	sentinel := errors.New("insufficient balance")
	err := Do(context.Background(), fastOpts(), func() error {
		attempts++
		return sentinel
	})
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected business sentinel to surface, got %v", err)
	}
	if attempts != 1 {
		t.Fatalf("business error must not be retried: expected 1 attempt, got %d", attempts)
	}
}

// TestDo_ExhaustsAttemptsAndReturnsLastError verifies a closure that always
// returns a retryable error stops after MaxAttempts and returns the last error
// (no infinite loop).
func TestDo_ExhaustsAttemptsAndReturnsLastError(t *testing.T) {
	opts := fastOpts()
	opts.MaxAttempts = 4
	attempts := 0
	err := Do(context.Background(), opts, func() error {
		attempts++
		return pgErr("40001")
	})
	if err == nil {
		t.Fatal("expected the last transient error after exhausting attempts, got nil")
	}
	if !IsRetryable(err) {
		t.Fatalf("expected the surfaced error to still be the transient one, got %v", err)
	}
	if attempts != 4 {
		t.Fatalf("expected exactly MaxAttempts=4 invocations, got %d", attempts)
	}
}

// TestDo_Success_NoRetry verifies the happy path runs the closure exactly once.
func TestDo_Success_NoRetry(t *testing.T) {
	attempts := 0
	err := Do(context.Background(), fastOpts(), func() error {
		attempts++
		return nil
	})
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if attempts != 1 {
		t.Fatalf("expected 1 attempt on success, got %d", attempts)
	}
}

// TestDo_RespectsContextCancellation verifies a cancelled context aborts the
// retry loop instead of sleeping/looping further.
func TestDo_RespectsContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	attempts := 0
	err := Do(ctx, fastOpts(), func() error {
		attempts++
		cancel() // cancel after the first transient failure
		return pgErr("40001")
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled after cancellation, got %v", err)
	}
	if attempts != 1 {
		t.Fatalf("expected the loop to stop after cancellation: got %d attempts", attempts)
	}
}

// TestIsRetryable_Classification table-drives the classifier so the retryable
// set is locked down and a future edit that widens it (e.g. retrying 23505)
// fails loudly.
func TestIsRetryable_Classification(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"serialization_failure 40001", pgErr("40001"), true},
		{"deadlock_detected 40P01", pgErr("40P01"), true},
		{"unique_violation 23505", pgErr("23505"), false},
		{"foreign_key_violation 23503", pgErr("23503"), false},
		{"check_violation 23514", pgErr("23514"), false},
		{"not_null_violation 23502", pgErr("23502"), false},
		{"plain business error", errors.New("nope"), false},
		{"plain io error not safe-to-retry", errors.New("unexpected EOF"), false},
		{"transient conn (SafeToRetry)", safeToRetryErr{}, true},
		{"wrapped transient conn (SafeToRetry)", errWrap(safeToRetryErr{}), true},
		{"wrapped serialization_failure", errWrap(pgErr("40001")), true},
		{"wrapped unique_violation", errWrap(pgErr("23505")), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsRetryable(tc.err); got != tc.want {
				t.Fatalf("IsRetryable(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

func errWrap(err error) error {
	return wrapped{err}
}

type wrapped struct{ inner error }

func (w wrapped) Error() string { return "wrapped: " + w.inner.Error() }
func (w wrapped) Unwrap() error { return w.inner }

// --- InTx composition tests (fake TxBeginner, no live DB) ---

// fakeTx embeds pgx.Tx so it satisfies the interface; the InTx tests below only
// drive Commit/Rollback, so the embedded nil is never dereferenced. Any other
// method call would panic, which is the desired loud failure if the closure
// touches the DB unexpectedly.
type fakeTx struct {
	pgx.Tx
	committed  bool
	rolledBack bool
}

func (t *fakeTx) Commit(context.Context) error {
	t.committed = true
	return nil
}

func (t *fakeTx) Rollback(context.Context) error {
	t.rolledBack = true
	return nil
}

// fakeBeginner returns a transient error on the first beginsFail Begin calls,
// then hands out a fresh fakeTx. It models a pooler bounce / serialization
// failure occurring at BEGIN time.
type fakeBeginner struct {
	beginsFail int
	beginCalls int
	txs        []*fakeTx
}

func (b *fakeBeginner) Begin(context.Context) (pgx.Tx, error) {
	b.beginCalls++
	if b.beginCalls <= b.beginsFail {
		return nil, pgErr("40001") // serialization_failure at BEGIN
	}
	tx := &fakeTx{}
	b.txs = append(b.txs, tx)
	return tx, nil
}

// TestInTx_RetriesWholeTransactionOnTransientBegin proves the ledger contract:
// a transient failure (here at BEGIN) retries the WHOLE transaction, and the
// final successful attempt commits. Each attempt is a fresh transaction, so a
// rolled-back attempt leaves no partial state.
func TestInTx_RetriesWholeTransactionOnTransientBegin(t *testing.T) {
	b := &fakeBeginner{beginsFail: 2} // fail BEGIN twice, succeed on the 3rd
	closureRuns := 0
	err := InTx(context.Background(), fastOpts(), b, func(tx pgx.Tx) error {
		closureRuns++
		return nil // success → BeginFunc commits
	})
	if err != nil {
		t.Fatalf("expected success after transient BEGIN retries, got %v", err)
	}
	if b.beginCalls != 3 {
		t.Fatalf("expected 3 BEGIN attempts (2 transient + 1 success), got %d", b.beginCalls)
	}
	if closureRuns != 1 {
		t.Fatalf("closure should run once (only on the successful BEGIN), got %d", closureRuns)
	}
	if len(b.txs) != 1 || !b.txs[0].committed {
		t.Fatalf("expected exactly one committed transaction, got txs=%d", len(b.txs))
	}
}

// TestInTx_RollsBackAndDoesNotRetryNonRetryableClosureError proves a
// non-retryable closure error (e.g. a constraint/business error) rolls the
// transaction back and surfaces immediately without re-running — the
// no-double-apply guarantee for the ledger paths.
func TestInTx_RollsBackAndDoesNotRetryNonRetryableClosureError(t *testing.T) {
	b := &fakeBeginner{beginsFail: 0}
	businessErr := pgErr("23505") // unique_violation — non-retryable
	closureRuns := 0
	err := InTx(context.Background(), fastOpts(), b, func(tx pgx.Tx) error {
		closureRuns++
		return businessErr
	})
	if !errors.Is(err, businessErr) {
		t.Fatalf("expected the non-retryable closure error to surface, got %v", err)
	}
	if closureRuns != 1 {
		t.Fatalf("non-retryable closure error must not be retried: got %d runs", closureRuns)
	}
	if len(b.txs) != 1 || !b.txs[0].rolledBack {
		t.Fatalf("expected the single transaction to be rolled back, got txs=%d", len(b.txs))
	}
	if b.txs[0].committed {
		t.Fatal("transaction must NOT be committed when the closure errored")
	}
}
