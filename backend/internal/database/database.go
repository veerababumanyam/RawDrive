// Package database provides PostgreSQL database access, migrations, and RLS enforcement.
package database

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

// Migrator handles database schema migrations.
type Migrator struct {
	dsn string
}

const migrationAdvisoryLockKey int64 = 6_420_017

// NewMigrator creates a new Migrator for the given DSN.
func NewMigrator(dsn string) *Migrator {
	return &Migrator{dsn: dsn}
}

// Up applies all up migrations in order.
func (m *Migrator) Up() error {
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, m.dsn)
	if err != nil {
		return fmt.Errorf("connecting to database: %w", err)
	}
	defer pool.Close()

	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquiring migration connection: %w", err)
	}
	defer conn.Release()

	if _, err = conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, migrationAdvisoryLockKey); err != nil {
		return fmt.Errorf("acquiring migration lock: %w", err)
	}
	defer func() {
		_, _ = conn.Exec(ctx, `SELECT pg_advisory_unlock($1)`, migrationAdvisoryLockKey)
	}()

	// Create migrations tracking table
	_, err = conn.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version VARCHAR(255) PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		return fmt.Errorf("creating schema_migrations table: %w", err)
	}

	files, err := getMigrationFiles("up")
	if err != nil {
		return err
	}

	for _, file := range files {
		version := extractVersion(file)

		// Check if already applied
		var exists bool
		err := conn.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)`,
			version).Scan(&exists)
		if err != nil {
			return fmt.Errorf("checking migration %s: %w", version, err)
		}
		if exists {
			continue
		}

		sql, err := migrationFS.ReadFile("migrations/" + file)
		if err != nil {
			return fmt.Errorf("reading migration %s: %w", file, err)
		}

		_, err = conn.Exec(ctx, string(sql))
		if err != nil {
			return fmt.Errorf("applying migration %s: %w", file, err)
		}

		_, err = conn.Exec(ctx,
			`INSERT INTO schema_migrations (version) VALUES ($1)
			 ON CONFLICT (version) DO NOTHING`, version)
		if err != nil {
			return fmt.Errorf("recording migration %s: %w", version, err)
		}
	}

	return nil
}

// Down rolls back all migrations in reverse order.
func (m *Migrator) Down() error {
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, m.dsn)
	if err != nil {
		return fmt.Errorf("connecting to database: %w", err)
	}
	defer pool.Close()

	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquiring migration connection: %w", err)
	}
	defer conn.Release()

	if _, err = conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, migrationAdvisoryLockKey); err != nil {
		return fmt.Errorf("acquiring migration lock: %w", err)
	}
	defer func() {
		_, _ = conn.Exec(ctx, `SELECT pg_advisory_unlock($1)`, migrationAdvisoryLockKey)
	}()

	files, err := getMigrationFiles("down")
	if err != nil {
		return err
	}

	// Reverse order for down migrations. getMigrationFiles already sorts
	// ascending via lessMigration (prefix width, then numeric value, then
	// full name); reversing that slice yields a true mirror of the up order.
	// We deliberately do NOT re-sort with sort.StringSlice here — a raw
	// lexicographic sort would re-introduce the differently-zero-padded
	// interleave (e.g. "000014" vs "014") that lessMigration fixes.
	for i, j := 0, len(files)-1; i < j; i, j = i+1, j-1 {
		files[i], files[j] = files[j], files[i]
	}

	for _, file := range files {
		version := extractVersion(file)

		sql, err := migrationFS.ReadFile("migrations/" + file)
		if err != nil {
			return fmt.Errorf("reading migration %s: %w", file, err)
		}

		_, err = conn.Exec(ctx, string(sql))
		if err != nil {
			return fmt.Errorf("rolling back migration %s: %w", file, err)
		}

		_, err = conn.Exec(ctx,
			`DELETE FROM schema_migrations WHERE version = $1`, version)
		if err != nil {
			// Ignore errors deleting from schema_migrations during down
			// (table itself may have been dropped)
		}
	}

	// Drop the schema_migrations table itself
	_, _ = conn.Exec(ctx, `DROP TABLE IF EXISTS schema_migrations`)

	return nil
}

func getMigrationFiles(direction string) ([]string, error) {
	entries, err := fs.ReadDir(migrationFS, "migrations")
	if err != nil {
		return nil, fmt.Errorf("reading migrations directory: %w", err)
	}

	var files []string
	suffix := "." + direction + ".sql"
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), suffix) {
			files = append(files, entry.Name())
		}
	}

	sort.Slice(files, func(i, j int) bool {
		return lessMigration(files[i], files[j])
	})
	return files, nil
}

// lessMigration is the canonical ordering for migration filenames. It groups
// files by the *width* (digit count) of their numeric prefix first, then sorts
// numerically by value within each width group, then by full filename.
//
// Width is the primary key because the repo mixes two zero-padding widths: the
// established core migrations use a 3-digit prefix (001..122) while the four M5
// migrations were committed with a 6-digit prefix (000014..000017). Both
// "014_create_share_links" and "000014_create_m5_marketplace_tables" parse to
// the numeric value 14, so a value-first ordering interleaves the 6-digit M5
// files among the 3-digit core M2/M3 files at logical orders 14-17 (and mirrors
// that interleave on rollback). The naive lexicographic tie-break makes it
// worse: "000014" < "014" sorts each M5 file BEFORE its core counterpart.
//
// Sorting by width first keeps each zero-padding family contiguous and runs the
// whole 3-digit core sequence (which the M5 tables depend on — users,
// workspaces, states, galleries) before the 6-digit M5 block. That is the same
// effect the finding's "renumber 000014-000017 to a slot above the highest
// migration" recommendation would have, achieved without mutating committed
// migration files or rewriting schema_migrations on existing databases. (F-024)
func lessMigration(a, b string) bool {
	aOrder, aWidth := migrationOrder(a)
	bOrder, bWidth := migrationOrder(b)
	if aWidth != bWidth {
		return aWidth < bWidth
	}
	if aOrder != bOrder {
		return aOrder < bOrder
	}
	return a < b
}

func extractVersion(filename string) string {
	// Extract "001_create_states" from "001_create_states.up.sql"
	parts := strings.SplitN(filename, ".", 2)
	if len(parts) > 0 {
		return parts[0]
	}
	return filename
}

// migrationOrder returns the numeric value of a migration filename's leading
// digit prefix and the width (digit count) of that prefix. The width is what
// lets the sort comparator distinguish two files whose values collide under
// different zero-padding (e.g. "014_..." and "000014_..." both yield value 14
// but widths 3 and 6). A filename with no leading digits returns (0, 0).
func migrationOrder(filename string) (order, width int) {
	var prefix strings.Builder
	for _, ch := range filename {
		if ch < '0' || ch > '9' {
			break
		}
		prefix.WriteRune(ch)
	}

	if prefix.Len() == 0 {
		return 0, 0
	}

	order, err := strconv.Atoi(prefix.String())
	if err != nil {
		return 0, 0
	}

	return order, prefix.Len()
}
