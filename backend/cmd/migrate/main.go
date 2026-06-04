// Command migrate applies all backend schema migrations to the database
// configured by DATABASE_URL and exits.
//
// Usage:
//
//	migrate            apply all pending up migrations (default; one-shot)
//	migrate up         alias for the default
//	migrate status     print the pending plan + checksum drift, then exit 0
//	migrate verify     exit 0 only if the DB is at head (no pending migrations)
//	migrate version    print the embedded head + the current applied max
//
// Run `migrate` as a one-shot Docker Compose service before the api service
// starts. `migrate status` / `migrate verify` are used by the deploy pipeline
// to show the plan before applying and to gate the deploy after applying.
//
// Exit codes: 0 success, 1 config error, 2 migration error, 3 status had
// pending migrations (status --strict only), 4 verify found the DB behind head.
//
// This binary wraps the existing database.Migrator (used today only from
// tests) and gives it a production entry point. See design spec
// docs/superpowers/specs/2026-04-11-hostinger-production-bootstrap-design.md
// §5.1 for rationale.
//
// Service credentials are intentionally not rotated by schema migrations. After
// changing SMTP/storage/payment env values, run sync-platform-settings-from-env
// with the narrow category/key filter, then use the relevant smoke command
// (for email, smtp-smoke) before considering the deploy healthy.
package main

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/rawdrive/backend/internal/database"
)

func main() {
	args := os.Args[1:]
	cmd := "up"
	var flags []string
	for _, a := range args {
		if strings.HasPrefix(a, "-") {
			flags = append(flags, a)
			continue
		}
		cmd = a
	}

	if err := run(cmd, flags, os.Getenv("DATABASE_URL")); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		switch {
		case errors.Is(err, errMissingDSN):
			os.Exit(1)
		case errors.Is(err, errPending):
			os.Exit(3)
		case errors.Is(err, errBehind):
			os.Exit(4)
		default:
			os.Exit(2)
		}
	}
}

var (
	errMissingDSN = errors.New("DATABASE_URL is required")
	errPending    = errors.New("pending migrations")
	errBehind     = errors.New("database is behind head")
)

// runMigrate is the original "apply all up migrations" entry point, retained as
// a thin alias over run("up", …) so existing callers/tests stay valid.
func runMigrate(dsn string) error {
	return run("up", nil, dsn)
}

func run(cmd string, flags []string, dsn string) error {
	if dsn == "" {
		return errMissingDSN
	}
	migrator := database.NewMigrator(dsn)

	switch cmd {
	case "up", "":
		if err := migrator.Up(); err != nil {
			return fmt.Errorf("migration failed: %w", err)
		}
		fmt.Println("migrations applied successfully")
		return nil

	case "status":
		st, err := migrator.Status()
		if err != nil {
			return fmt.Errorf("status failed: %w", err)
		}
		printStatus(st)
		// `status --strict` is a CI/deploy gate: non-zero when work is pending.
		if hasFlag(flags, "--strict") && len(st.Pending) > 0 {
			return errPending
		}
		return nil

	case "verify":
		if err := migrator.Verify(); err != nil {
			return fmt.Errorf("%w: %v", errBehind, err)
		}
		fmt.Println("verify: database is at head")
		return nil

	case "version":
		st, err := migrator.Status()
		if err != nil {
			return fmt.Errorf("version failed: %w", err)
		}
		fmt.Printf("head=%s applied_max=%s applied_count=%d pending=%d\n",
			st.Head, emptyDash(st.CurrentMax), st.AppliedCount, len(st.Pending))
		return nil

	default:
		return fmt.Errorf("unknown subcommand %q (want: up|status|verify|version)", cmd)
	}
}

func printStatus(st *database.MigrationStatus) {
	fmt.Printf("head=%s applied_max=%s applied_count=%d pending=%d drift=%d\n",
		st.Head, emptyDash(st.CurrentMax), st.AppliedCount, len(st.Pending), len(st.Drift))
	for _, v := range st.Pending {
		fmt.Printf("PENDING %s\n", v)
	}
	for _, v := range st.Drift {
		fmt.Printf("DRIFT   %s\n", v)
	}
}

func hasFlag(flags []string, want string) bool {
	for _, f := range flags {
		if f == want {
			return true
		}
	}
	return false
}

func emptyDash(s string) string {
	if s == "" {
		return "-"
	}
	return s
}
