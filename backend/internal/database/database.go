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

	// Reverse order for down migrations
	sort.Sort(sort.Reverse(sort.StringSlice(files)))

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
		leftOrder := migrationOrder(files[i])
		rightOrder := migrationOrder(files[j])
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		return files[i] < files[j]
	})
	return files, nil
}

func extractVersion(filename string) string {
	// Extract "001_create_states" from "001_create_states.up.sql"
	parts := strings.SplitN(filename, ".", 2)
	if len(parts) > 0 {
		return parts[0]
	}
	return filename
}

func migrationOrder(filename string) int {
	var prefix strings.Builder
	for _, ch := range filename {
		if ch < '0' || ch > '9' {
			break
		}
		prefix.WriteRune(ch)
	}

	if prefix.Len() == 0 {
		return 0
	}

	order, err := strconv.Atoi(prefix.String())
	if err != nil {
		return 0
	}

	return order
}
