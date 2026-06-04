package migrations

// m160_role_session_timeouts_test.go — hermetic content contract for
// migration 160 (no database required).
//
// Migration 160 bounds three failure modes that were previously UNBOUNDED for
// the application role (Postgres defaults all three to 0 = unlimited):
//   - statement_timeout                    — a runaway query pins a pooled conn
//   - lock_timeout                         — a statement waits forever for a lock
//   - idle_in_transaction_session_timeout  — an abandoned open tx holds locks
//
// The fix is a server-side ALTER ROLE (NOT app-side pgx RuntimeParams), because
// production fronts Postgres with pgbouncer in pool_mode=transaction: a
// statement_timeout startup parameter would be rejected by pgbouncer (no
// ignore_startup_parameters), and a session SET is wiped by server_reset_query
// = DISCARD ALL. Role-level defaults survive DISCARD ALL (RESET ALL resets TO
// the role default) and apply uniformly to direct-connect dev too.
//
// This guard pins the migration's content so the bound can't silently regress
// (e.g. a later edit dropping idle_in_transaction_session_timeout).

import (
	"os"
	"strings"
	"testing"
)

const (
	mig160Up   = "160_role_session_timeouts.up.sql"
	mig160Down = "160_role_session_timeouts.down.sql"
)

func readMigration(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(name)
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	return string(b)
}

func TestMigration160UpSetsAllThreeSessionTimeouts(t *testing.T) {
	body := readMigration(t, mig160Up)
	lower := strings.ToLower(body)

	// Self-label header must match the file number (F-105 numbering contract).
	first := firstCommentLine(t, mig160Up)
	if !strings.Contains(first, "Migration 160") {
		t.Fatalf("first line must self-label as Migration 160, got %q", first)
	}

	for _, guc := range []string{
		"statement_timeout",
		"lock_timeout",
		"idle_in_transaction_session_timeout",
	} {
		if !strings.Contains(lower, guc) {
			t.Errorf("up migration must set %s", guc)
		}
	}

	// Must be a role-level default (survives pgbouncer transaction pooling),
	// not a bare session SET. CURRENT_USER keeps it role-agnostic.
	if !strings.Contains(lower, "alter role") {
		t.Error("up migration must use ALTER ROLE (role-level default), not a session SET")
	}
	if !strings.Contains(strings.ToUpper(body), "CURRENT_USER") {
		t.Error("up migration must target CURRENT_USER so it is not hardcoded to one role name")
	}
}

func TestMigration160DownIsReversible(t *testing.T) {
	body := readMigration(t, mig160Down)
	lower := strings.ToLower(body)

	if !strings.Contains(lower, "alter role") || !strings.Contains(lower, "reset") {
		t.Error("down migration must ALTER ROLE ... RESET the timeouts")
	}
	for _, guc := range []string{
		"statement_timeout",
		"lock_timeout",
		"idle_in_transaction_session_timeout",
	} {
		if !strings.Contains(lower, guc) {
			t.Errorf("down migration must reset %s", guc)
		}
	}
}
