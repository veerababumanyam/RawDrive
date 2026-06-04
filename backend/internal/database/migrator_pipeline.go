package database

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// This file hardens the migration runner into a professional, fail-safe
// pipeline. It is purely additive on top of the original Migrator.Up loop:
//
//   1. Per-migration atomicity. A migration's DDL and its schema_migrations
//      bookkeeping row are committed together inside ONE explicit transaction,
//      so a crash can never leave a migration "applied but unrecorded" (which
//      would silently re-run on the next deploy) or "recorded but only
//      half-applied". The wrap is SKIPPED for the 33 committed migrations that
//      manage their own transaction (BEGIN; ... COMMIT;) — wrapping those would
//      let their embedded COMMIT close the outer transaction early — and for any
//      future migration that opts out via a `-- migrate:no-transaction` header
//      (e.g. CREATE INDEX CONCURRENTLY, which cannot run inside a transaction).
//
//   2. Checksum drift detection. Every applied migration's sha256 is recorded.
//      On a later run, if a committed-and-applied migration's bytes changed, the
//      pipeline warns (default) or fails (RAWDRIVE_MIGRATE_STRICT_CHECKSUM=1).
//      This catches the "someone edited an already-applied migration" class of
//      schema drift that the version-only tracker silently ignored.
//
//   3. Read-only Status() / Verify() for the deploy pipeline to (a) print the
//      pending plan before applying and (b) assert the DB reached head after.
//
// Environment switches (all default to the safe/quiet behavior):
//   RAWDRIVE_MIGRATE_STRICT_CHECKSUM=1  -> drift is a hard error, not a warning
//   RAWDRIVE_MIGRATE_NO_TX_WRAP=1       -> disable per-migration tx wrap globally
//                                          (escape hatch; reverts to legacy Exec)

const (
	envStrictChecksum = "RAWDRIVE_MIGRATE_STRICT_CHECKSUM"
	envNoTxWrap       = "RAWDRIVE_MIGRATE_NO_TX_WRAP"
)

// checksumHex returns the hex-encoded sha256 of a migration's bytes.
func checksumHex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// short truncates a checksum for human-readable log/error messages.
func short(s string) string {
	if len(s) > 12 {
		return s[:12]
	}
	return s
}

// hasNoTxnDirective reports whether a migration opts out of the explicit
// transaction wrap via a `-- migrate:no-transaction` directive in its header.
// This is the forward-compatible escape hatch for statements that cannot run
// inside a transaction (CREATE INDEX CONCURRENTLY, VACUUM, ALTER SYSTEM, ...).
// No committed migration uses it today (none use CONCURRENTLY) but the hook
// keeps the door open without another migrator change.
func hasNoTxnDirective(sqlBytes []byte) bool {
	// Only scan the header region; the directive is a header convention.
	head := sqlBytes
	if len(head) > 4096 {
		head = head[:4096]
	}
	for _, line := range strings.Split(string(head), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "--") {
			continue
		}
		norm := strings.ToLower(strings.ReplaceAll(line, " ", ""))
		if strings.Contains(norm, "migrate:no-transaction") ||
			strings.Contains(norm, "migrate:no-txn") {
			return true
		}
	}
	return false
}

// managesOwnTransaction reports whether a migration contains its own top-level
// transaction-control statement (BEGIN; / COMMIT; / ROLLBACK; / START
// TRANSACTION). 33 committed migrations self-wrap their body in BEGIN; ...
// COMMIT;. Such files MUST NOT be given an additional outer transaction: the
// embedded COMMIT would close the outer transaction early, after which the
// bookkeeping INSERT would run outside any transaction.
//
// The scanner strips -- line comments and /* */ block comments and skips
// single-quoted strings and dollar-quoted bodies ($tag$...$tag$), so PL/pgSQL
// BEGIN/END blocks, string literals, and comments are never mistaken for
// transaction control. It only inspects the FIRST keyword token of each
// top-level statement.
func managesOwnTransaction(sqlBytes []byte) bool {
	s := string(sqlBytes)
	i := 0
	n := len(s)
	atStatementStart := true // expecting the first token of a statement

	isIdentByte := func(b byte) bool {
		return b == '_' ||
			(b >= 'a' && b <= 'z') ||
			(b >= 'A' && b <= 'Z') ||
			(b >= '0' && b <= '9')
	}

	for i < n {
		c := s[i]

		switch {
		// Line comment: -- ... to end of line
		case c == '-' && i+1 < n && s[i+1] == '-':
			for i < n && s[i] != '\n' {
				i++
			}
			continue

		// Block comment: /* ... */ (Postgres allows nesting; track depth)
		case c == '/' && i+1 < n && s[i+1] == '*':
			i += 2
			depth := 1
			for i < n && depth > 0 {
				if s[i] == '/' && i+1 < n && s[i+1] == '*' {
					depth++
					i += 2
					continue
				}
				if s[i] == '*' && i+1 < n && s[i+1] == '/' {
					depth--
					i += 2
					continue
				}
				i++
			}
			continue

		// Single-quoted string literal: '...' with '' escaping
		case c == '\'':
			i++
			for i < n {
				if s[i] == '\'' {
					if i+1 < n && s[i+1] == '\'' { // escaped quote
						i += 2
						continue
					}
					i++
					break
				}
				i++
			}
			continue

		// Dollar-quoted string: $tag$ ... $tag$ (tag may be empty: $$)
		case c == '$':
			if tag, ok := dollarTagAt(s, i); ok {
				closing := tag
				i += len(tag)
				idx := strings.Index(s[i:], closing)
				if idx < 0 {
					i = n // unterminated; treat rest as quoted
				} else {
					i += idx + len(closing)
				}
				continue
			}
			// Not a dollar-quote opener; treat as ordinary punctuation.
			i++
			atStatementStart = false
			continue

		// Statement terminator
		case c == ';':
			i++
			atStatementStart = true
			continue

		// Whitespace
		case c == ' ' || c == '\t' || c == '\r' || c == '\n':
			i++
			continue
		}

		// A non-whitespace, non-comment, non-quote token.
		if atStatementStart && isIdentByte(c) {
			start := i
			for i < n && isIdentByte(s[i]) {
				i++
			}
			word := strings.ToUpper(s[start:i])
			switch word {
			case "BEGIN", "COMMIT", "ROLLBACK", "START", "END":
				// START TRANSACTION, plain BEGIN;, COMMIT;, ROLLBACK;, END; —
				// all top-level transaction control.
				return true
			}
			atStatementStart = false
			continue
		}

		atStatementStart = false
		i++
	}
	return false
}

// dollarTagAt returns the dollar-quote opening tag (e.g. "$$" or "$func$") if
// one begins at position i, and whether a valid tag was found. A dollar-quote
// tag is $ <optional identifier> $.
func dollarTagAt(s string, i int) (string, bool) {
	if i >= len(s) || s[i] != '$' {
		return "", false
	}
	j := i + 1
	for j < len(s) {
		b := s[j]
		if b == '$' {
			return s[i : j+1], true
		}
		isTagByte := b == '_' ||
			(b >= 'a' && b <= 'z') ||
			(b >= 'A' && b <= 'Z') ||
			(b >= '0' && b <= '9')
		if !isTagByte {
			return "", false
		}
		j++
	}
	return "", false
}

// ensureMigrationsTable creates the tracking table (legacy-compatible) and
// idempotently adds the checksum column used for drift detection.
func ensureMigrationsTable(ctx context.Context, conn migExecer) error {
	if _, err := conn.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version VARCHAR(255) PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`); err != nil {
		return fmt.Errorf("creating schema_migrations table: %w", err)
	}
	if _, err := conn.Exec(ctx,
		`ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT`); err != nil {
		return fmt.Errorf("adding schema_migrations.checksum column: %w", err)
	}
	return nil
}

// loadAppliedMigrations returns version -> checksum for every recorded
// migration. A legacy row applied before the checksum column existed maps to
// "" (empty), which callers treat as "baseline me, don't fail".
func loadAppliedMigrations(ctx context.Context, conn migQuerier) (map[string]string, error) {
	rows, err := conn.Query(ctx, `SELECT version, COALESCE(checksum, '') FROM schema_migrations`)
	if err != nil {
		return nil, fmt.Errorf("loading applied migrations: %w", err)
	}
	defer rows.Close()

	applied := make(map[string]string)
	for rows.Next() {
		var version, sum string
		if err := rows.Scan(&version, &sum); err != nil {
			return nil, fmt.Errorf("scanning applied migration: %w", err)
		}
		applied[version] = sum
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating applied migrations: %w", err)
	}
	return applied, nil
}

// applyMigration applies one pending migration. When wrap is true the DDL and
// the bookkeeping row commit atomically in one explicit transaction; when false
// (self-managed transaction, or no-transaction directive, or the global escape
// hatch) it runs with the legacy autocommit behavior.
func applyMigration(ctx context.Context, conn migTxBeginner, version, sql, checksum string, wrap bool) error {
	const record = `
		INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)
		ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum`

	if !wrap {
		if _, err := conn.Exec(ctx, sql); err != nil {
			return fmt.Errorf("applying migration %s: %w", version, err)
		}
		if _, err := conn.Exec(ctx, record, version, checksum); err != nil {
			return fmt.Errorf("recording migration %s: %w", version, err)
		}
		return nil
	}

	tx, err := conn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("beginning transaction for migration %s: %w", version, err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(ctx)
		}
	}()

	if _, err := tx.Exec(ctx, sql); err != nil {
		return fmt.Errorf("applying migration %s: %w", version, err)
	}
	if _, err := tx.Exec(ctx, record, version, checksum); err != nil {
		return fmt.Errorf("recording migration %s: %w", version, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing migration %s: %w", version, err)
	}
	committed = true
	return nil
}

// shouldWrapInTx decides whether a pending migration gets the atomic explicit
// transaction wrap.
func shouldWrapInTx(sqlBytes []byte) bool {
	if os.Getenv(envNoTxWrap) == "1" {
		return false
	}
	if hasNoTxnDirective(sqlBytes) {
		return false
	}
	if managesOwnTransaction(sqlBytes) {
		return false
	}
	return true
}

// MigrationStatus is the read-only view used by `migrate status` and the deploy
// pipeline's pre-apply plan / post-apply verification.
type MigrationStatus struct {
	AppliedCount int      // rows in schema_migrations
	Head         string   // highest embedded up-migration version (target)
	CurrentMax   string   // highest applied version (empty if none)
	Pending      []string // embedded up-migration versions not yet applied, in order
	Drift        []string // applied versions whose checksum no longer matches the file
}

// Status returns the pending plan and any checksum drift without applying
// anything. It is safe to run against a fresh database (missing table => every
// migration pending).
func (m *Migrator) Status() (*MigrationStatus, error) {
	ctx := context.Background()
	pool, err := m.newPool(ctx)
	if err != nil {
		return nil, fmt.Errorf("connecting to database: %w", err)
	}
	defer pool.Close()

	files, err := getMigrationFiles("up")
	if err != nil {
		return nil, err
	}

	applied, err := loadAppliedMigrations(ctx, pool)
	if err != nil {
		// A brand-new database has no schema_migrations table yet; treat as
		// "nothing applied" rather than an error so `status` works pre-bootstrap.
		applied = map[string]string{}
	}

	st := &MigrationStatus{AppliedCount: len(applied)}
	for _, file := range files {
		version := extractVersion(file)
		st.Head = version // files are ordered; last wins
		sum, ok := applied[version]
		if !ok {
			st.Pending = append(st.Pending, version)
			continue
		}
		if version > st.CurrentMax {
			st.CurrentMax = version
		}
		if sum != "" {
			sqlBytes, rerr := migrationFS.ReadFile("migrations/" + file)
			if rerr == nil && checksumHex(sqlBytes) != sum {
				st.Drift = append(st.Drift, version)
			}
		}
	}
	return st, nil
}

// Verify asserts the database is at head (every embedded up-migration applied).
// Drift is reported as an error only under RAWDRIVE_MIGRATE_STRICT_CHECKSUM=1,
// matching Up()'s default-warn / strict-fail behavior.
func (m *Migrator) Verify() error {
	st, err := m.Status()
	if err != nil {
		return err
	}
	if len(st.Pending) > 0 {
		return fmt.Errorf("database is not at head: %d migration(s) pending (next: %s, head: %s)",
			len(st.Pending), st.Pending[0], st.Head)
	}
	if len(st.Drift) > 0 && os.Getenv(envStrictChecksum) == "1" {
		return fmt.Errorf("checksum drift on already-applied migration(s): %s", strings.Join(st.Drift, ", "))
	}
	return nil
}

// ExpectedHeadVersion returns the highest embedded up-migration version without
// touching the database. Used by readiness checks to know the deploy target.
func ExpectedHeadVersion() (string, error) {
	files, err := getMigrationFiles("up")
	if err != nil {
		return "", err
	}
	if len(files) == 0 {
		return "", nil
	}
	return extractVersion(files[len(files)-1]), nil
}

// embeddedUpVersions returns the set of every embedded up-migration version.
func embeddedUpVersions() (map[string]struct{}, int, error) {
	files, err := getMigrationFiles("up")
	if err != nil {
		return nil, 0, err
	}
	set := make(map[string]struct{}, len(files))
	for _, f := range files {
		set[extractVersion(f)] = struct{}{}
	}
	return set, len(files), nil
}

// MigrationsAtHead reports whether every embedded up-migration is recorded in
// schema_migrations. It is the lightweight check the health/readiness endpoint
// uses: a backend whose binary embeds migrations the database has not applied
// is not truly ready to serve. expected is the embedded migration count;
// appliedOfExpected is how many of those are present.
func MigrationsAtHead(ctx context.Context, q migQuerier) (atHead bool, appliedOfExpected, expected int, err error) {
	want, total, err := embeddedUpVersions()
	if err != nil {
		return false, 0, 0, err
	}
	rows, err := q.Query(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		// No tracking table yet => nothing applied.
		return total == 0, 0, total, nil //nolint:nilerr // missing table is "behind", not an error
	}
	defer rows.Close()

	have := 0
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return false, 0, total, fmt.Errorf("scanning applied version: %w", err)
		}
		if _, ok := want[v]; ok {
			have++
		}
	}
	if err := rows.Err(); err != nil {
		return false, 0, total, fmt.Errorf("iterating applied versions: %w", err)
	}
	return have == total, have, total, nil
}

// --- minimal pgx interfaces so helpers work with both *pgxpool.Pool and a
//     pooled *pgxpool.Conn (and pgx.Tx) without threading concrete types
//     everywhere. Both *pgxpool.Pool and *pgxpool.Conn satisfy all three. ---

type migExecer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

type migQuerier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

type migTxBeginner interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Begin(ctx context.Context) (pgx.Tx, error)
}
