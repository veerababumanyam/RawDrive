// Command migrate applies all backend schema migrations to the database
// configured by DATABASE_URL and exits.
//
// Usage: run as a one-shot Docker Compose service before the api service
// starts. Exit codes: 0 success, 1 config error, 2 migration error.
//
// This binary wraps the existing database.Migrator (used today only from
// tests) and gives it a production entry point. See design spec
// docs/superpowers/specs/2026-04-11-hostinger-production-bootstrap-design.md
// §5.1 for rationale.
package main

import (
	"errors"
	"fmt"
	"os"

	"github.com/rawdrive/backend/internal/database"
)

func main() {
	if err := runMigrate(os.Getenv("DATABASE_URL")); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		if errors.Is(err, errMissingDSN) {
			os.Exit(1)
		}
		os.Exit(2)
	}
	fmt.Println("migrations applied successfully")
}

var errMissingDSN = errors.New("DATABASE_URL is required")

func runMigrate(dsn string) error {
	if dsn == "" {
		return errMissingDSN
	}
	migrator := database.NewMigrator(dsn)
	if err := migrator.Up(); err != nil {
		return fmt.Errorf("migration failed: %w", err)
	}
	return nil
}
