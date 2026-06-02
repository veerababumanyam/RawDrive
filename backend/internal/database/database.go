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

	"github.com/jackc/pgx/v5"
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
	pool, err := m.newPool(ctx)
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
	pool, err := m.newPool(ctx)
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

func (m *Migrator) newPool(ctx context.Context) (*pgxpool.Pool, error) {
	cfg, err := newMigrationPoolConfig(m.dsn)
	if err != nil {
		return nil, err
	}
	return pgxpool.NewWithConfig(ctx, cfg)
}

func newMigrationPoolConfig(dsn string) (*pgxpool.Config, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}
	// Production migrations run through pgbouncer. pgx's default
	// cache_statement mode creates named prepared statements that can collide
	// across pooled server sessions, so migrations use extended query protocol
	// without preparing/caching statements.
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
	cfg.MaxConns = 1
	cfg.MinConns = 0
	return cfg, nil
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

// lessMigration is the canonical ordering for migration filenames. It sorts by
// the *numeric value* of the prefix first, then by prefix width (digit count)
// as a tie-break, then by full filename.
//
// History: the repo mixes two zero-padding widths. The established core
// migrations use a 3-digit prefix (001..132) while the four M5 migrations were
// committed with a 6-digit prefix (000014..000017). Both "014_create_share_links"
// and "000014_create_m5_marketplace_tables" parse to the numeric value 14.
//
// F-024 originally sorted by *width* first, which ran the entire 3-digit core
// sequence and only then the 6-digit M5 block as a trailing group. That was
// dependency-safe at the time because nothing numbered above 017 referenced the
// M5 tables. That assumption no longer holds: migrations 114
// (marketplace_inquiry_reply) and 115 (inquiry_messages) are 3-digit migrations
// that depend on marketplace_inquiries — a table created in the 6-digit 000014
// block. Under width-first ordering the 000014 block ran *last* (after 132), so
// a fresh database failed at 114 with "relation marketplace_inquiries does not
// exist".
//
// Value-first ordering runs every migration in true numeric order, placing the
// M5 block at its logical slots 14-17 — after the foundational tables it
// references (users=002, workspaces=005, states=001, galleries=007, all < 14)
// and before its later consumers (114/115). The width tie-break is retained so
// that within a tied value the 3-digit core file still precedes its 6-digit M5
// neighbour (e.g. 014_create_share_links before 000014_create_m5_marketplace_tables);
// this is dependency-safe because no M5 file references a 3-digit migration in
// the 15-113 range (verified: M5 FKs target only users/workspaces/states/
// galleries plus tables created within the M5 block itself). Changing the
// comparator does not rewrite schema_migrations: already-applied versions are
// tracked by full filename and simply skipped, so existing databases are
// unaffected and only fresh migrations observe the new order. (F-024 / fresh-DB
// marketplace-inquiry ordering fix)
func lessMigration(a, b string) bool {
	aOrder, aWidth := migrationOrder(a)
	bOrder, bWidth := migrationOrder(b)
	if aOrder != bOrder {
		return aOrder < bOrder
	}
	if aWidth != bWidth {
		return aWidth < bWidth
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
