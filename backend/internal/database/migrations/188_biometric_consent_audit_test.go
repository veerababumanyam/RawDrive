package migrations

// Contract test for migration 188 — append-only biometric consent + face-search
// audit table (3b / DPDP·GDPR Art 9).
//
// This is a pure-unit, hermetic guard (no database required): it scans the
// committed 188_biometric_consent_audit.{up,down}.sql files on disk and asserts
// the audit ledger keeps its load-bearing shape so a future edit cannot quietly
// drop the RLS policy, the workspace/gallery scoping, the endpoint contract, or
// re-introduce selfie/embedding storage (which the E2EE law forbids).
//
// A real-Postgres apply/rollback + cross-tenant RLS test lives alongside this
// file under the `integration` build tag (TEST_DATABASE_URL); the hermetic
// assertions here always run in CI and in `go test ./internal/database/migrations`.

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// stripSQLLineComments removes `-- ...` line comments so structural assertions
// (e.g. "no embedding column") inspect only the executable DDL, not the prose in
// the migration's explanatory header.
func stripSQLLineComments(sql string) string {
	var b strings.Builder
	for _, line := range strings.Split(sql, "\n") {
		if i := strings.Index(line, "--"); i >= 0 {
			line = line[:i]
		}
		b.WriteString(line)
		b.WriteString("\n")
	}
	return b.String()
}

const (
	biometricAuditUp   = "188_biometric_consent_audit.up.sql"
	biometricAuditDown = "188_biometric_consent_audit.down.sql"
)

func readMigrationFile(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(name)
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	return string(b)
}

// TestM188_CreatesAuditTableWithRequiredColumns pins the table name and the
// minimum column set the repository + handler depend on.
func TestM188_CreatesAuditTableWithRequiredColumns(t *testing.T) {
	sql := readMigrationFile(t, biometricAuditUp)

	if !regexp.MustCompile(`(?is)create\s+table\s+if\s+not\s+exists\s+biometric_search_audit`).MatchString(sql) {
		t.Fatalf("%s must CREATE TABLE IF NOT EXISTS biometric_search_audit", biometricAuditUp)
	}

	requiredColumns := []string{
		"workspace_id",
		"gallery_id",
		"session_subject",
		"endpoint",
		"consent_given",
		"match_count",
		"created_at",
	}
	for _, col := range requiredColumns {
		if !regexp.MustCompile(`(?i)\b` + regexp.QuoteMeta(col) + `\b`).MatchString(sql) {
			t.Fatalf("%s must define column %q", biometricAuditUp, col)
		}
	}
}

// TestM188_ScopedByWorkspaceAndGallery asserts the workspace + gallery FK
// scoping that makes cross-tenant isolation possible.
func TestM188_ScopedByWorkspaceAndGallery(t *testing.T) {
	sql := readMigrationFile(t, biometricAuditUp)
	if !regexp.MustCompile(`(?is)workspace_id\s+uuid\s+not\s+null\s+references\s+workspaces\s*\(\s*id\s*\)`).MatchString(sql) {
		t.Fatalf("%s must scope workspace_id NOT NULL REFERENCES workspaces(id)", biometricAuditUp)
	}
	if !regexp.MustCompile(`(?is)gallery_id\s+uuid\s+not\s+null\s+references\s+galleries\s*\(\s*id\s*\)`).MatchString(sql) {
		t.Fatalf("%s must scope gallery_id NOT NULL REFERENCES galleries(id)", biometricAuditUp)
	}
}

// TestM188_EnablesRLSWorkspaceIsolation pins the RLS policy and the
// app.current_workspace_id / app.workspace_id convention shared with the other
// face tables (migration 180). Without this an anonymous public connection
// could read another tenant's audit ledger.
func TestM188_EnablesRLSWorkspaceIsolation(t *testing.T) {
	sql := readMigrationFile(t, biometricAuditUp)
	if !regexp.MustCompile(`(?is)alter\s+table\s+biometric_search_audit\s+enable\s+row\s+level\s+security`).MatchString(sql) {
		t.Fatalf("%s must ENABLE ROW LEVEL SECURITY on biometric_search_audit", biometricAuditUp)
	}
	if !regexp.MustCompile(`(?is)create\s+policy\s+\w+\s+on\s+biometric_search_audit`).MatchString(sql) {
		t.Fatalf("%s must CREATE POLICY on biometric_search_audit", biometricAuditUp)
	}
	if !regexp.MustCompile(`(?i)app\.current_workspace_id`).MatchString(sql) {
		t.Fatalf("%s RLS policy must key on app.current_workspace_id", biometricAuditUp)
	}
}

// TestM188_EndpointContractEnforced pins the CHECK that constrains endpoint to
// the two biometric matching surfaces, so the audit ledger can't be polluted
// with arbitrary endpoint strings.
func TestM188_EndpointContractEnforced(t *testing.T) {
	sql := readMigrationFile(t, biometricAuditUp)
	if !regexp.MustCompile(`(?is)endpoint\s+text\s+not\s+null\s+check\s*\(\s*endpoint\s+in\s*\(\s*'photo_search'\s*,\s*'face_match'\s*\)`).MatchString(sql) {
		t.Fatalf("%s must CHECK endpoint IN ('photo_search','face_match')", biometricAuditUp)
	}
}

// TestM188_StoresNoSelfieOrEmbedding is the E2EE-law guard: the audit table must
// never carry a selfie image or a selfie embedding. We assert no embedding/
// vector/image/selfie column ever appears in the migration.
func TestM188_StoresNoSelfieOrEmbedding(t *testing.T) {
	sql := stripSQLLineComments(readMigrationFile(t, biometricAuditUp))
	forbidden := []string{"embedding", "vector(", "selfie", "image_data", " bytea"}
	for _, f := range forbidden {
		if regexp.MustCompile(`(?i)` + regexp.QuoteMeta(f)).MatchString(sql) {
			t.Fatalf("%s must NOT store %q — no selfie image or embedding may be persisted (E2EE law)", biometricAuditUp, f)
		}
	}
}

// TestM188_DownDropsTable asserts the paired down migration removes the table,
// policy, and index so a rollback fully reverts the slice.
func TestM188_DownDropsTable(t *testing.T) {
	sql := readMigrationFile(t, biometricAuditDown)
	if !regexp.MustCompile(`(?is)drop\s+table\s+if\s+exists\s+biometric_search_audit`).MatchString(sql) {
		t.Fatalf("%s must DROP TABLE IF EXISTS biometric_search_audit", biometricAuditDown)
	}
	if !regexp.MustCompile(`(?is)drop\s+policy\s+if\s+exists\s+\w+\s+on\s+biometric_search_audit`).MatchString(sql) {
		t.Fatalf("%s must DROP POLICY ... ON biometric_search_audit", biometricAuditDown)
	}
}
