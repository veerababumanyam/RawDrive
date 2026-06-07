package migrations

// Contract test for migration 191 — re-enable FaceID: revert
// workspaces.face_recognition_enabled default FALSE → TRUE and backfill existing
// rows to TRUE (owner decision to operate E2EE posture (a), reverting 190).
//
// Pure-unit, hermetic guard (no database required): scans the committed
// 191_*.{up,down}.sql files and asserts the default flip, the backfill, and the
// paired rollback. Reuses readMigrationFile / stripSQLLineComments from the 188
// contract test (same `migrations` package).

import (
	"regexp"
	"testing"
)

const (
	faceReenableUp   = "191_workspaces_face_recognition_reenable_default_true.up.sql"
	faceReenableDown = "191_workspaces_face_recognition_reenable_default_true.down.sql"
)

// TestM191_UpSetsDefaultTrue asserts the up migration flips the column default
// back to TRUE — the core of the re-enable.
func TestM191_UpSetsDefaultTrue(t *testing.T) {
	sql := stripSQLLineComments(readMigrationFile(t, faceReenableUp))
	if !regexp.MustCompile(`(?is)alter\s+column\s+face_recognition_enabled\s+set\s+default\s+true`).MatchString(sql) {
		t.Fatalf("%s must ALTER COLUMN face_recognition_enabled SET DEFAULT TRUE", faceReenableUp)
	}
}

// TestM191_UpBackfillsExistingRowsToTrue asserts every existing workspace is
// re-enabled, not just the default for new rows.
func TestM191_UpBackfillsExistingRowsToTrue(t *testing.T) {
	sql := stripSQLLineComments(readMigrationFile(t, faceReenableUp))
	if !regexp.MustCompile(`(?is)update\s+workspaces\s+set\s+face_recognition_enabled\s*=\s*true`).MatchString(sql) {
		t.Fatalf("%s must UPDATE workspaces SET face_recognition_enabled = TRUE (backfill existing rows)", faceReenableUp)
	}
}

// TestM191_UpGuardsColumnExistsOnFreshDB pins the ADD COLUMN IF NOT EXISTS guard
// (F-006) so the migration cannot fail on a fresh DB.
func TestM191_UpGuardsColumnExistsOnFreshDB(t *testing.T) {
	sql := stripSQLLineComments(readMigrationFile(t, faceReenableUp))
	if !regexp.MustCompile(`(?is)add\s+column\s+if\s+not\s+exists\s+face_recognition_enabled`).MatchString(sql) {
		t.Fatalf("%s must ADD COLUMN IF NOT EXISTS face_recognition_enabled before ALTER/UPDATE (F-006 guard)", faceReenableUp)
	}
}

// TestM191_DownRestoresDefaultFalse asserts the paired down migration restores
// migration 190's opt-out default of FALSE so a rollback fully reverts the slice.
func TestM191_DownRestoresDefaultFalse(t *testing.T) {
	sql := stripSQLLineComments(readMigrationFile(t, faceReenableDown))
	if !regexp.MustCompile(`(?is)alter\s+column\s+face_recognition_enabled\s+set\s+default\s+false`).MatchString(sql) {
		t.Fatalf("%s must ALTER COLUMN face_recognition_enabled SET DEFAULT FALSE (restore 190 posture)", faceReenableDown)
	}
}
