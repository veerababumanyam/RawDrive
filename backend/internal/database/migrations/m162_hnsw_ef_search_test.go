package migrations

// m162_hnsw_ef_search_test.go — hermetic content contract for migration 162
// (no database required). Reuses readMigration/firstCommentLine from the
// package (added by m160 / f105).
//
// Migration 162 raises the role-level hnsw.ef_search default from pgvector's 40
// to 200 so HNSW index scans explore enough candidates for the face-match
// query's LIMIT 200. This guard pins the GUC + value AND the load-bearing
// `::vector` prefix that lets a non-superuser set the custom GUC — dropping
// that prefix would reintroduce a "permission denied to set parameter" failure.

import (
	"strings"
	"testing"
)

const (
	mig162Up   = "162_hnsw_ef_search.up.sql"
	mig162Down = "162_hnsw_ef_search.down.sql"
)

func TestMigration162SetsEfSearchRoleDefault(t *testing.T) {
	body := readMigration(t, mig162Up)
	lower := strings.ToLower(body)

	first := firstCommentLine(t, mig162Up)
	if !strings.Contains(first, "Migration 162") {
		t.Fatalf("first line must self-label as Migration 162, got %q", first)
	}

	if !strings.Contains(lower, "alter role") {
		t.Error("up migration must use ALTER ROLE (role-level default)")
	}
	if !strings.Contains(strings.ToUpper(body), "CURRENT_USER") {
		t.Error("up migration must target CURRENT_USER (role-agnostic)")
	}
	if !strings.Contains(lower, "hnsw.ef_search") {
		t.Error("up migration must set hnsw.ef_search")
	}
	if !strings.Contains(body, "200") {
		t.Error("up migration must set ef_search to 200 (>= the face-search LIMIT)")
	}
	if !strings.Contains(lower, "::vector") {
		t.Error("up migration must force-load pgvector (::vector cast) before ALTER ROLE so a non-superuser can set the custom GUC")
	}
}

func TestMigration162DownResetsEfSearch(t *testing.T) {
	body := readMigration(t, mig162Down)
	lower := strings.ToLower(body)

	if !strings.Contains(lower, "alter role") || !strings.Contains(lower, "reset") {
		t.Error("down migration must ALTER ROLE ... RESET hnsw.ef_search")
	}
	if !strings.Contains(lower, "hnsw.ef_search") {
		t.Error("down migration must reference hnsw.ef_search")
	}
	if !strings.Contains(lower, "::vector") {
		t.Error("down migration must force-load pgvector (::vector cast) before RESET so a non-superuser can reset the custom GUC")
	}
}
