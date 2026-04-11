// Package main implements schematool — a minimal migration runner
// used exclusively by the §5.4 schema drift CI gate.
//
// Why this binary exists (and why cmd/api does not cover it)
//
// The production backend applies migrations on startup by calling
// database.NewMigrator(dsn).Up() inside main.go, but booting cmd/api
// also requires JWT signing keys, SMTP config, R2 credentials, the
// NATS event broker, and every other runtime dependency — none of
// which CI has (and none of which matter for "just apply the
// migrations and quit"). schematool is the exact minimal subset:
// open a pgxpool against DATABASE_URL, call Migrator.Up(), exit.
//
// Usage
//
//	DATABASE_URL=postgres://user:pass@host:5432/dbname go run ./backend/cmd/schematool
//
// Invoked by scripts/ci-schema-check.sh and by the schema-drift job
// in .github/workflows/production-gates.yml. Not invoked by the
// running backend or by any test suite — it is CI tooling, not
// runtime code.
//
// Exit codes
//
//	0  migrations applied (or already up to date)
//	1  DATABASE_URL unset, connect error, or migration apply error
package main

import (
	"log"
	"os"

	"github.com/rawdrive/backend/internal/database"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("schematool: DATABASE_URL environment variable is required " +
			"(expected format: postgres://user:pass@host:port/dbname)")
	}

	migrator := database.NewMigrator(dsn)
	if err := migrator.Up(); err != nil {
		log.Fatalf("schematool: migrate up failed: %v", err)
	}

	log.Println("schematool: all migrations applied successfully")
}
