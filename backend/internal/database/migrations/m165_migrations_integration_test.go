//go:build integration
// +build integration

// Real Postgres runtime contract for migration 165 — pg_trgm GIN indexes that
// back the owner gallery title/description search (D2, 2026-06-04 perf audit).
//
// The default file-string suite (m165_migrations_test.go) locks the SQL at the
// byte level. This suite locks the *runtime* contract: the named indexes exist
// after the migrator has run, and — critically — the planner actually USES a
// trigram bitmap index scan for the leading-wildcard `ILIKE '%term%'` search
// instead of the sequential scan it was stuck with before the index existed.
//
// Assumes migration 165 is already applied against TEST_DATABASE_URL (the
// migrator ran on startup). Skips cleanly when TEST_DATABASE_URL is unset.

package migrations_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestM165_TrgmIndexesExist(t *testing.T) {
	pool := connectTestDB(t)

	assert.True(t, indexExists(t, pool, "galleries", "idx_galleries_title_trgm"),
		"migration 165 must create the galleries.title pg_trgm GIN index")
	assert.True(t, indexExists(t, pool, "galleries", "idx_galleries_description_trgm"),
		"migration 165 must create the galleries.description pg_trgm GIN index")
}

// TestM165_SearchUsesTrgmBitmapScan proves the planner reaches the trigram
// index for the exact owner-search predicate GalleryRepo.List emits. We disable
// seqscan for the EXPLAIN (the trgm index must be the planner's choice once a
// seq scan is off the table — if it were unusable, Postgres would error or fall
// back, and the plan would NOT mention the trgm index).
func TestM165_SearchUsesTrgmBitmapScan(t *testing.T) {
	pool := connectTestDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Mirror the GalleryRepo.List search predicate (leading + trailing wildcard).
	const explainSQL = `EXPLAIN
		SELECT g.id FROM galleries g
		WHERE g.deleted_at IS NULL
		  AND (g.title ILIKE $1 OR g.description ILIKE $1)`

	// Force the planner off sequential scans for this statement only so the
	// EXPLAIN deterministically reveals whether the trigram index is reachable.
	_, err := pool.Exec(ctx, "SET LOCAL enable_seqscan = off")
	// SET LOCAL outside an explicit txn is a no-op warning, not an error; the
	// session-level SET below is the durable one for this pooled conn.
	_ = err
	_, err = pool.Exec(ctx, "SET enable_seqscan = off")
	require.NoError(t, err)
	t.Cleanup(func() {
		c, cc := context.WithTimeout(context.Background(), 5*time.Second)
		defer cc()
		_, _ = pool.Exec(c, "RESET enable_seqscan")
	})

	rows, err := pool.Query(ctx, explainSQL, "%wedding%")
	require.NoError(t, err, "EXPLAIN of the gallery search must run")
	defer rows.Close()

	var plan strings.Builder
	for rows.Next() {
		var line string
		require.NoError(t, rows.Scan(&line))
		plan.WriteString(line)
		plan.WriteString("\n")
	}
	require.NoError(t, rows.Err())

	planText := plan.String()
	t.Logf("EXPLAIN plan:\n%s", planText)

	assert.Contains(t, planText, "idx_galleries_title_trgm",
		"the title trigram index must appear in the search plan (no seq scan)")
	assert.True(t,
		strings.Contains(planText, "Bitmap Index Scan") || strings.Contains(planText, "Bitmap Heap Scan"),
		"the trigram search must use a bitmap index scan, got:\n%s", planText)
}
