// Package dbretry provides a small, reusable transient-error retry helper for
// transactional Postgres write paths.
//
// Why this exists (DB-6b): without a retry/backoff layer, a pgbouncer/pooler
// bounce or a serialization conflict surfaces directly as a request error
// instead of being transparently retried. Postgres documents two error classes
// that are *expected* under concurrency and are safe to retry by re-running the
// whole transaction:
//
//   - 40001 serialization_failure — the transaction was aborted due to a
//     serialization conflict (e.g. SERIALIZABLE / REPEATABLE READ contention,
//     or a FOR UPDATE race the database chose to abort).
//   - 40P01 deadlock_detected — the transaction was chosen as a deadlock victim.
//
// In addition, transient *connection* errors (a pooler bounce, a dropped
// connection that pgx flags as safe-to-retry) should be retried.
//
// Everything else — constraint violations (23xxx), business/validation errors,
// context cancellation — is NOT retryable and surfaces immediately. Retrying a
// constraint or business error would mask a real fault and risk incorrect
// behaviour.
//
// Idempotency contract: callers must retry the *whole transaction* via InTx (or
// pass a closure to Do that begins/commits a fresh tx each attempt). pgx's
// BeginFunc rolls a failed attempt back fully, so a retried attempt starts from
// a clean state and there is no partial-write / double-apply risk.
package dbretry

import (
	"context"
	"errors"
	"math/rand"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Postgres SQLSTATE codes that are safe to retry by re-running the whole
// transaction. Kept as named constants so the retryable set is explicit and
// auditable — widening it is a deliberate, reviewable change.
const (
	sqlStateSerializationFailure = "40001"
	sqlStateDeadlockDetected     = "40P01"
)

// Options tunes the retry policy. The zero value is not usable on its own;
// callers should use DefaultOptions() and adjust as needed.
type Options struct {
	// MaxAttempts is the total number of times the closure may run (initial
	// try + retries). Must be >= 1; values < 1 are coerced to 1.
	MaxAttempts int
	// BaseDelay is the backoff before the first retry. Subsequent retries use
	// exponential backoff (BaseDelay * 2^(attempt-1)) capped at MaxDelay, with
	// full jitter applied.
	BaseDelay time.Duration
	// MaxDelay caps the per-retry backoff so exponential growth stays bounded.
	MaxDelay time.Duration

	// jitter is injectable for deterministic tests. nil means full jitter
	// (random in [0, d]). Unexported so production callers always get jitter.
	jitter func(time.Duration) time.Duration
}

// DefaultOptions returns the production retry policy: a small number of bounded
// attempts with jittered exponential backoff. Tuned for transactional write
// paths (credit/coupon ledgers) where a transient serialization/deadlock or a
// pooler bounce should be retried quickly without amplifying load under
// sustained contention.
func DefaultOptions() Options {
	return Options{
		MaxAttempts: 5,
		BaseDelay:   5 * time.Millisecond,
		MaxDelay:    250 * time.Millisecond,
	}
}

// IsRetryable reports whether err is a transient, safe-to-retry database error:
// a Postgres serialization_failure (40001) or deadlock_detected (40P01), or a
// transient connection error that pgx flags as safe to retry. It unwraps the
// error chain, so wrapped errors (fmt.Errorf("...: %w", err)) classify
// correctly. Everything else — including constraint violations and business
// errors — returns false.
func IsRetryable(err error) bool {
	if err == nil {
		return false
	}
	// Never retry on a cancelled / timed-out context — that is the caller
	// pulling the plug, not a transient DB fault.
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return false
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case sqlStateSerializationFailure, sqlStateDeadlockDetected:
			return true
		default:
			// Any other Postgres error (constraint violation, etc.) is a real
			// fault — do not retry.
			return false
		}
	}

	// Transient connection errors: pgconn flags connect/timeout/pool-bounce
	// errors that did not (or could not) execute as safe to retry.
	return pgconn.SafeToRetry(err)
}

// Do runs fn, retrying it while it returns a retryable error (see IsRetryable)
// and attempts remain. It returns nil on success, the last error after
// exhausting MaxAttempts, or the first non-retryable error immediately.
//
// fn MUST be self-contained per attempt: for a transactional write it should
// begin and commit a fresh transaction each call (use InTx, which does this via
// pgx.BeginFunc). A failed attempt is fully rolled back before the next one, so
// there is no partial-write or double-apply across retries.
func Do(ctx context.Context, opts Options, fn func() error) error {
	attempts := opts.MaxAttempts
	if attempts < 1 {
		attempts = 1
	}

	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		// Bail before running if the caller already cancelled.
		if err := ctx.Err(); err != nil {
			return err
		}

		lastErr = fn()
		if lastErr == nil {
			return nil
		}
		if !IsRetryable(lastErr) {
			return lastErr
		}
		if attempt == attempts {
			break // exhausted — surface the last transient error
		}

		// Honour cancellation during backoff instead of sleeping blindly.
		// A cancelled context means the caller aborted: surface that rather
		// than a stale transient DB error, so callers see why we stopped.
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff(opts, attempt)):
		}
	}
	return lastErr
}

// InTx runs fn inside a database transaction, retrying the WHOLE transaction on
// transient errors. Each attempt begins a fresh transaction via pgx.BeginFunc:
// fn's nil return commits, a non-nil return rolls back. Because every retry is a
// fresh, fully-rolled-back transaction, ledger writes stay correct (no
// double-apply, no partial state) under retry.
//
// db is anything that can Begin a transaction (*pgxpool.Pool satisfies this).
func InTx(ctx context.Context, opts Options, db TxBeginner, fn func(pgx.Tx) error) error {
	return Do(ctx, opts, func() error {
		return pgx.BeginFunc(ctx, db, fn)
	})
}

// TxBeginner is the narrow surface InTx needs to start a transaction. Both
// *pgxpool.Pool and *pgx.Conn satisfy it structurally.
type TxBeginner interface {
	Begin(ctx context.Context) (pgx.Tx, error)
}

// backoff computes the jittered exponential delay before the given retry. The
// raw delay is BaseDelay * 2^(attempt-1) capped at MaxDelay; full jitter then
// spreads it across [0, delay] to avoid thundering-herd retries.
func backoff(opts Options, attempt int) time.Duration {
	base := opts.BaseDelay
	if base <= 0 {
		base = DefaultOptions().BaseDelay
	}
	maxDelay := opts.MaxDelay
	if maxDelay <= 0 {
		maxDelay = DefaultOptions().MaxDelay
	}

	delay := base
	for i := 1; i < attempt; i++ {
		delay *= 2
		if delay >= maxDelay {
			delay = maxDelay
			break
		}
	}
	if delay > maxDelay {
		delay = maxDelay
	}

	if opts.jitter != nil {
		return opts.jitter(delay)
	}
	return fullJitter(delay)
}

// fullJitter returns a random duration in [0, d]. Uses the package-level rand
// source; the retry path is not security-sensitive so math/rand is fine.
func fullJitter(d time.Duration) time.Duration {
	if d <= 0 {
		return 0
	}
	return time.Duration(rand.Int63n(int64(d) + 1)) //nolint:gosec // jitter, not security-sensitive
}
