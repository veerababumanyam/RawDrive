package handler

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

// fakeOrderExecer drives markUpgradeOrderFailed without a real DB. It records
// the SQL/args it was called with and returns a configurable CommandTag/error,
// mirroring the fake-repo style used by payment_handler_test.go (F-014/F-026).
type fakeOrderExecer struct {
	tag     pgconn.CommandTag
	err     error
	called  bool
	gotSQL  string
	gotArgs []any
}

func (f *fakeOrderExecer) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	f.called = true
	f.gotSQL = sql
	f.gotArgs = args
	return f.tag, f.err
}

// Log capture for these tests reuses the shared captureLog helper defined in
// chunked_upload_refundlog_test.go (same package handler) — keeping one
// implementation avoids the redeclaration collision two agents introduced.

// TestF067UpgradeOrderFailureNotSwallowed is the regression test for F-067:
// before the fix the UPDATE that flips a failed PhonePe order to 'failed' was
// issued via `_, _ = h.db.Exec(...)`, discarding both the error and the
// rows-affected count, so a failed UPDATE (or a no-op match) silently left the
// order 'pending'. markUpgradeOrderFailed must now surface both conditions.
func TestF067UpgradeOrderFailureNotSwallowed(t *testing.T) {
	const orderID = "order-123"

	t.Run("exec error is logged, not swallowed", func(t *testing.T) {
		f := &fakeOrderExecer{err: errors.New("connection reset")}
		out := captureLog(func() {
			markUpgradeOrderFailed(context.Background(), f, orderID)
		})
		if !f.called {
			t.Fatal("expected Exec to be called")
		}
		if !strings.Contains(out, "failed to mark phonepe order "+orderID+" failed") {
			t.Fatalf("expected error to be logged, got %q", out)
		}
		if !strings.Contains(out, "connection reset") {
			t.Fatalf("expected underlying error in log, got %q", out)
		}
	})

	t.Run("zero rows affected is logged as a no-op warning", func(t *testing.T) {
		f := &fakeOrderExecer{tag: pgconn.NewCommandTag("UPDATE 0")}
		out := captureLog(func() {
			markUpgradeOrderFailed(context.Background(), f, orderID)
		})
		if !strings.Contains(out, "no pending row matched") {
			t.Fatalf("expected no-pending-row warning, got %q", out)
		}
	})

	t.Run("successful update logs nothing", func(t *testing.T) {
		f := &fakeOrderExecer{tag: pgconn.NewCommandTag("UPDATE 1")}
		out := captureLog(func() {
			markUpgradeOrderFailed(context.Background(), f, orderID)
		})
		if out != "" {
			t.Fatalf("expected no log output on success, got %q", out)
		}
		// Guard the WHERE clause that scopes the update to pending rows only.
		if !strings.Contains(f.gotSQL, "status = 'pending'") {
			t.Fatalf("update must only target pending rows, sql=%q", f.gotSQL)
		}
		if len(f.gotArgs) != 1 || f.gotArgs[0] != orderID {
			t.Fatalf("expected order id as sole arg, got %v", f.gotArgs)
		}
	})
}
