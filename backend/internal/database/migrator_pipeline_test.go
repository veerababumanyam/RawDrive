package database

import (
	"strings"
	"testing"
)

func TestManagesOwnTransaction(t *testing.T) {
	cases := []struct {
		name string
		sql  string
		want bool
	}{
		{"plain ddl", "CREATE TABLE x (id int);", false},
		{"explicit begin/commit", "BEGIN;\nCREATE TABLE x();\nCOMMIT;", true},
		{"lowercase spaced", "  begin ;\nCREATE TABLE x();\n commit ;", true},
		{"commit after statement", "CREATE TABLE x(); COMMIT;", true},
		{"start transaction", "START TRANSACTION;\nCREATE TABLE x();\nCOMMIT;", true},
		{"rollback", "ROLLBACK;", true},
		// PL/pgSQL BEGIN/END inside a dollar-quoted body is NOT transaction control.
		{"do block", "DO $$ BEGIN PERFORM 1; END; $$;", false},
		{"function body", "CREATE FUNCTION f() RETURNS void AS $func$ BEGIN RETURN; END; $func$ LANGUAGE plpgsql;", false},
		{"nested dollar tag", "CREATE FUNCTION f() RETURNS void AS $a$ BEGIN END; $a$ LANGUAGE plpgsql;", false},
		// BEGIN appearing inside comments / strings must be ignored.
		{"line comment", "-- BEGIN;\nCREATE TABLE x();", false},
		{"block comment", "/* BEGIN; COMMIT; */ CREATE TABLE x();", false},
		{"string literal", "INSERT INTO t (v) VALUES ('BEGIN;');", false},
		{"escaped quote string", "INSERT INTO t (v) VALUES ('it''s BEGIN; here');", false},
		{"empty", "", false},
		{"comment only", "-- nothing here\n", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := managesOwnTransaction([]byte(c.sql)); got != c.want {
				t.Fatalf("managesOwnTransaction(%q) = %v, want %v", c.sql, got, c.want)
			}
		})
	}
}

// TestManagesOwnTransactionRealFiles anchors the scanner to actual committed
// migrations so a future refactor can't silently regress the classification
// that the per-migration transaction wrap depends on.
func TestManagesOwnTransactionRealFiles(t *testing.T) {
	selfManaged := []string{
		"050_dsr_eraser_redaction.up.sql",           // BEGIN; ... COMMIT; + PL/pgSQL blocks
		"153_gallery_asset_hot_path_indexes.up.sql", // BEGIN; ... COMMIT;
	}
	for _, f := range selfManaged {
		b, err := migrationFS.ReadFile("migrations/" + f)
		if err != nil {
			t.Fatalf("read %s: %v", f, err)
		}
		if !managesOwnTransaction(b) {
			t.Errorf("%s should be detected as self-managing its transaction", f)
		}
	}

	// 069 mentions CONCURRENTLY only in a comment and has no top-level
	// transaction control: it must be eligible for the wrap.
	b, err := migrationFS.ReadFile("migrations/069_soc2_audit_log_index.up.sql")
	if err != nil {
		t.Fatalf("read 069: %v", err)
	}
	if managesOwnTransaction(b) {
		t.Errorf("069 has no top-level BEGIN/COMMIT and must NOT be flagged self-managed")
	}
}

// TestNoEmbeddedMigrationUsesConcurrently guards the assumption that every
// embedded migration is transaction-safe (so wrapping is correct). If someone
// adds a CREATE INDEX CONCURRENTLY migration in the future, this fails and
// reminds them to add the `-- migrate:no-transaction` header.
func TestNoEmbeddedMigrationUsesConcurrently(t *testing.T) {
	files, err := getMigrationFiles("up")
	if err != nil {
		t.Fatalf("getMigrationFiles: %v", err)
	}
	for _, f := range files {
		b, err := migrationFS.ReadFile("migrations/" + f)
		if err != nil {
			t.Fatalf("read %s: %v", f, err)
		}
		// Cheap textual check: any real CONCURRENTLY statement must carry the
		// no-transaction directive, else the wrap would fail at runtime.
		lower := strings.ToLower(string(b))
		if strings.Contains(lower, "concurrently") && !hasNoTxnDirective(b) {
			// 069 references the word only in a comment; confirm it's not a real statement.
			if hasRealConcurrently(lower) {
				t.Errorf("%s uses CONCURRENTLY but lacks `-- migrate:no-transaction`", f)
			}
		}
	}
}

// hasRealConcurrently looks for CONCURRENTLY outside of a leading `--` comment
// line. Good enough for the guard test above.
func hasRealConcurrently(lower string) bool {
	for _, line := range strings.Split(lower, "\n") {
		t := strings.TrimSpace(line)
		if strings.HasPrefix(t, "--") {
			continue
		}
		if strings.Contains(t, "concurrently") {
			return true
		}
	}
	return false
}

func TestHasNoTxnDirective(t *testing.T) {
	cases := []struct {
		sql  string
		want bool
	}{
		{"-- migrate:no-transaction\nCREATE INDEX CONCURRENTLY i ON t(c);", true},
		{"-- migrate: no-transaction\nSELECT 1;", true},
		{"--migrate:no-txn\nSELECT 1;", true},
		{"CREATE TABLE x();", false},
		{"-- ordinary header comment\nCREATE TABLE x();", false},
	}
	for _, c := range cases {
		if got := hasNoTxnDirective([]byte(c.sql)); got != c.want {
			t.Errorf("hasNoTxnDirective(%q) = %v, want %v", c.sql, got, c.want)
		}
	}
}

func TestShouldWrapInTx(t *testing.T) {
	t.Setenv(envNoTxWrap, "")
	t.Setenv(envStrictChecksum, "")

	if !shouldWrapInTx([]byte("CREATE TABLE x();")) {
		t.Error("plain DDL should be wrapped")
	}
	if shouldWrapInTx([]byte("BEGIN;\nCREATE TABLE x();\nCOMMIT;")) {
		t.Error("self-managed transaction must NOT be wrapped")
	}
	if shouldWrapInTx([]byte("-- migrate:no-transaction\nCREATE INDEX CONCURRENTLY i ON t(c);")) {
		t.Error("no-transaction directive must NOT be wrapped")
	}

	t.Setenv(envNoTxWrap, "1")
	if shouldWrapInTx([]byte("CREATE TABLE x();")) {
		t.Error("global escape hatch must disable wrapping")
	}
}

func TestChecksumHex(t *testing.T) {
	a := checksumHex([]byte("CREATE TABLE x();"))
	b := checksumHex([]byte("CREATE TABLE x();"))
	c := checksumHex([]byte("CREATE TABLE y();"))
	if a != b {
		t.Error("checksum must be stable for identical input")
	}
	if a == c {
		t.Error("checksum must differ for different input")
	}
	if len(a) != 64 {
		t.Errorf("sha256 hex length = %d, want 64", len(a))
	}
}

func TestExpectedHeadVersion(t *testing.T) {
	head, err := ExpectedHeadVersion()
	if err != nil {
		t.Fatalf("ExpectedHeadVersion: %v", err)
	}
	if head == "" {
		t.Fatal("head must not be empty with embedded migrations present")
	}
	files, err := getMigrationFiles("up")
	if err != nil {
		t.Fatalf("getMigrationFiles: %v", err)
	}
	want := extractVersion(files[len(files)-1])
	if head != want {
		t.Errorf("ExpectedHeadVersion() = %q, want last embedded version %q", head, want)
	}
}

func TestDollarTagAt(t *testing.T) {
	cases := []struct {
		s     string
		i     int
		tag   string
		found bool
	}{
		{"$$", 0, "$$", true},
		{"$func$", 0, "$func$", true},
		{"$tag1$", 0, "$tag1$", true},
		{"$ not a tag", 0, "", false},
		{"plain", 0, "", false},
	}
	for _, c := range cases {
		tag, ok := dollarTagAt(c.s, c.i)
		if ok != c.found || tag != c.tag {
			t.Errorf("dollarTagAt(%q,%d) = (%q,%v), want (%q,%v)", c.s, c.i, tag, ok, c.tag, c.found)
		}
	}
}
