package migrations

// Regression test for F-006.
//
// Root cause: the migration that originally ran
// `ALTER TABLE workspaces ADD COLUMN face_recognition_enabled ...`
// lived in slot 110, which was later recycled for inquiry_messages
// (now migration 115). When slot 110 was repurposed the column-adding
// file was deleted, so NO migration in the committed sequence added the
// column -- yet migrations 111/112 and the runtime handlers all assume it
// exists. On a fresh database the runner fails at migration 112 with
// `column "face_recognition_enabled" does not exist`, and migrations
// 113-122 never apply.
//
// This is a pure-unit, hermetic guard (no database required): it scans the
// committed *.up.sql files on disk and asserts that the column is created
// via ADD COLUMN somewhere in the sequence, so that any future slot-recycle
// that drops the creating statement is caught in CI instead of on a fresh
// VPS. It fails on the broken tree (before the F-006 fix) and passes after.

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// addColumnRe matches an ADD COLUMN that creates face_recognition_enabled,
// tolerating optional IF NOT EXISTS and arbitrary intervening whitespace.
var addColumnRe = regexp.MustCompile(
	`(?is)add\s+column\s+(?:if\s+not\s+exists\s+)?face_recognition_enabled\b`,
)

// idempotentAddColumnRe is the strict form: ADD COLUMN IF NOT EXISTS. Used to
// assert migrations stay safe to re-run against DBs that already have the column.
var idempotentAddColumnRe = regexp.MustCompile(
	`(?is)add\s+column\s+if\s+not\s+exists\s+face_recognition_enabled`,
)

// createIndexRe matches the partial index creation for the column.
var createIndexRe = regexp.MustCompile(
	`(?is)create\s+index\s+if\s+not\s+exists\s+idx_workspaces_face_recognition_enabled`,
)

// referenceRe matches any reference to the column (ALTER COLUMN, UPDATE ... SET,
// SELECT, WHERE) that assumes the column already exists.
var referenceRe = regexp.MustCompile(`(?i)\bface_recognition_enabled\b`)

// readUpMigrations loads every *.up.sql in the working dir (the migrations dir).
func readUpMigrations(t *testing.T) map[string]string {
	t.Helper()

	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read migrations dir: %v", err)
	}

	out := make(map[string]string)
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".up.sql") {
			continue
		}
		b, err := os.ReadFile(filepath.Clean(name))
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		out[name] = string(b)
	}
	if len(out) == 0 {
		t.Fatal("no *.up.sql migrations found in working dir")
	}
	return out
}

// TestF006_FaceRecognitionColumnIsAddedBeforeUse guards against any migration
// referencing workspaces.face_recognition_enabled without an ADD COLUMN existing
// somewhere in the up sequence. This catches the exact fresh-DB break in F-006.
func TestF006_FaceRecognitionColumnIsAddedBeforeUse(t *testing.T) {
	ups := readUpMigrations(t)

	var addsColumn bool
	var referencingFiles []string
	for name, sql := range ups {
		if addColumnRe.MatchString(sql) {
			addsColumn = true
		}
		if referenceRe.MatchString(sql) {
			referencingFiles = append(referencingFiles, name)
		}
	}

	if len(referencingFiles) == 0 {
		// Nothing references the column; nothing to guard. (If the feature were
		// fully removed this test becomes a harmless no-op.)
		return
	}

	if !addsColumn {
		t.Fatalf(
			"%d migration(s) reference workspaces.face_recognition_enabled (%v) "+
				"but NO migration runs `ADD COLUMN ... face_recognition_enabled`; "+
				"a fresh DB will fail when the first referencing migration runs (F-006)",
			len(referencingFiles), referencingFiles,
		)
	}
}

// TestF006_Migration112IsIdempotentOnFreshDB asserts that migration 112 itself
// no longer assumes the column pre-exists: it must self-heal with an
// ADD COLUMN IF NOT EXISTS before it ALTERs the default / backfills. This pins
// the in-place idempotency fix so a future edit cannot silently revert it.
func TestF006_Migration112IsIdempotentOnFreshDB(t *testing.T) {
	const fname = "112_workspaces_face_recognition_default_true.up.sql"
	b, err := os.ReadFile(fname)
	if err != nil {
		t.Fatalf("read %s: %v", fname, err)
	}
	sql := string(b)

	if !idempotentAddColumnRe.MatchString(sql) {
		t.Fatalf("%s ALTERs/UPDATEs face_recognition_enabled without an "+
			"ADD COLUMN IF NOT EXISTS guard; fails on a fresh DB (F-006)", fname)
	}
}

// TestF006_Migration125AddColumnExists ensures the durable, append-only
// standalone migration that adds the column is present and idempotent, so the
// column has a discoverable creating migration where future readers expect one.
func TestF006_Migration125AddColumnExists(t *testing.T) {
	const fname = "125_workspaces_face_recognition_add_column.up.sql"
	b, err := os.ReadFile(fname)
	if err != nil {
		t.Fatalf("read %s (the durable ADD COLUMN migration is missing): %v", fname, err)
	}
	sql := string(b)

	if !idempotentAddColumnRe.MatchString(sql) {
		t.Fatalf("%s must ADD COLUMN IF NOT EXISTS face_recognition_enabled", fname)
	}
	if !createIndexRe.MatchString(sql) {
		t.Fatalf("%s must CREATE INDEX IF NOT EXISTS idx_workspaces_face_recognition_enabled", fname)
	}
}
