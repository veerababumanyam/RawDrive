package migrations

// Contract test for migration 190 — revert workspaces.face_recognition_enabled
// default TRUE → FALSE and backfill existing rows to FALSE (DPDP / GDPR Art 9
// opt-in posture, until the consent UI is rebuilt).
//
// Pure-unit, hermetic guard (no database required): it scans the committed
// 190_workspaces_face_recognition_default_false.{up,down}.sql files on disk and
// asserts the load-bearing shape so a future edit cannot quietly drop the
// default flip, the backfill, or the paired rollback.
//
// Reuses readMigrationFile / stripSQLLineComments from the 188 contract test
// (same `migrations` package).

import (
	"regexp"
	"testing"
)

const (
	faceDefaultFalseUp   = "190_workspaces_face_recognition_default_false.up.sql"
	faceDefaultFalseDown = "190_workspaces_face_recognition_default_false.down.sql"
)

// TestM190_UpSetsDefaultFalse asserts the up migration flips the column default
// to FALSE — the core of the change.
func TestM190_UpSetsDefaultFalse(t *testing.T) {
	sql := stripSQLLineComments(readMigrationFile(t, faceDefaultFalseUp))
	if !regexp.MustCompile(`(?is)alter\s+column\s+face_recognition_enabled\s+set\s+default\s+false`).MatchString(sql) {
		t.Fatalf("%s must ALTER COLUMN face_recognition_enabled SET DEFAULT FALSE", faceDefaultFalseUp)
	}
}

// TestM190_UpBackfillsExistingRowsToFalse asserts every existing workspace is
// flipped off, not just the default for new rows (full opt-out posture).
func TestM190_UpBackfillsExistingRowsToFalse(t *testing.T) {
	sql := stripSQLLineComments(readMigrationFile(t, faceDefaultFalseUp))
	if !regexp.MustCompile(`(?is)update\s+workspaces\s+set\s+face_recognition_enabled\s*=\s*false`).MatchString(sql) {
		t.Fatalf("%s must UPDATE workspaces SET face_recognition_enabled = FALSE (backfill existing rows)", faceDefaultFalseUp)
	}
}

// TestM190_UpGuardsColumnExistsOnFreshDB pins the ADD COLUMN IF NOT EXISTS guard
// so the migration cannot fail on a fresh DB the way migration 112 once did
// (F-006). Idempotent: a no-op where the column already exists.
func TestM190_UpGuardsColumnExistsOnFreshDB(t *testing.T) {
	sql := stripSQLLineComments(readMigrationFile(t, faceDefaultFalseUp))
	if !regexp.MustCompile(`(?is)add\s+column\s+if\s+not\s+exists\s+face_recognition_enabled`).MatchString(sql) {
		t.Fatalf("%s must ADD COLUMN IF NOT EXISTS face_recognition_enabled before ALTER/UPDATE (F-006 guard)", faceDefaultFalseUp)
	}
}

// TestM190_DownRestoresDefaultTrue asserts the paired down migration restores
// the migration 112 default of TRUE so a rollback fully reverts the slice.
func TestM190_DownRestoresDefaultTrue(t *testing.T) {
	sql := stripSQLLineComments(readMigrationFile(t, faceDefaultFalseDown))
	if !regexp.MustCompile(`(?is)alter\s+column\s+face_recognition_enabled\s+set\s+default\s+true`).MatchString(sql) {
		t.Fatalf("%s must ALTER COLUMN face_recognition_enabled SET DEFAULT TRUE (restore 112 posture)", faceDefaultFalseDown)
	}
}
