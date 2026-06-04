//go:build integration
// +build integration

// Real Postgres runtime contract for migration 167 — the asset filter (camera
// model) + sort (filename / size_bytes) indexes that back AssetRepo.List (Q-5).
//
// The default file-string suite (m167_migrations_test.go) locks the SQL at the
// byte level. This suite locks the *runtime* contract: the three named indexes
// exist after the migrator has run, and the planner actually USES them for the
// exact predicates AssetRepo.List emits —
//   • a trigram bitmap index scan for the leading-wildcard
//     `exif_data->>'model' ILIKE '%term%'` camera-model filter, and
//   • the partial composite btree (no Sort node) for ORDER BY filename / size_bytes
//     scoped to a workspace.
//
// Assumes migration 167 is already applied against TEST_DATABASE_URL (the
// migrator ran on startup). Skips cleanly when TEST_DATABASE_URL is unset.

package migrations_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestM167_FilterSortIndexesExist(t *testing.T) {
	pool := connectTestDB(t)

	assert.True(t, indexExists(t, pool, "assets", "idx_assets_exif_model_trgm"),
		"migration 167 must create the exif_data->>'model' pg_trgm GIN index")
	assert.True(t, indexExists(t, pool, "assets", "idx_assets_workspace_filename"),
		"migration 167 must create the (workspace_id, filename) sort index")
	assert.True(t, indexExists(t, pool, "assets", "idx_assets_workspace_size"),
		"migration 167 must create the (workspace_id, size_bytes) sort index")
}

// explainPlanText runs an EXPLAIN statement and returns the joined plan text.
// Inlined query/scan loop (mirrors m165) so it compiles against *pgxpool.Pool
// without an interface shim.
func explainPlanText(t *testing.T, pool *pgxpool.Pool, ctx context.Context, sql string, args ...any) string {
	t.Helper()
	rows, err := pool.Query(ctx, sql, args...)
	require.NoError(t, err, "EXPLAIN must run")
	defer rows.Close()

	var plan strings.Builder
	for rows.Next() {
		var line string
		require.NoError(t, rows.Scan(&line))
		plan.WriteString(line)
		plan.WriteString("\n")
	}
	require.NoError(t, rows.Err())
	return plan.String()
}

// disableSeqScan turns off sequential scans for the pooled session so EXPLAIN
// deterministically reveals whether the target index is reachable, and restores
// it on cleanup.
func disableSeqScan(t *testing.T, pool *pgxpool.Pool, ctx context.Context) {
	t.Helper()
	_, err := pool.Exec(ctx, "SET enable_seqscan = off")
	require.NoError(t, err)
	t.Cleanup(func() {
		c, cc := context.WithTimeout(context.Background(), 5*time.Second)
		defer cc()
		_, _ = pool.Exec(c, "RESET enable_seqscan")
	})
}

// TestM167_CameraModelFilterUsesTrgmIndex proves the planner reaches the
// expression trigram index for the camera-model predicate AssetRepo.List emits.
// Once a seq scan is off the table the trgm index must be the planner's only
// path to satisfy the leading-wildcard ILIKE — if the index were unusable, the
// plan would NOT mention it.
func TestM167_CameraModelFilterUsesTrgmIndex(t *testing.T) {
	pool := connectTestDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	disableSeqScan(t, pool, ctx)

	// Mirror the AssetRepo.List camera-model predicate (leading + trailing wildcard
	// over the JSONB key extraction).
	const explainSQL = `EXPLAIN
		SELECT id FROM assets
		WHERE deleted_at IS NULL
		  AND exif_data->>'model' ILIKE $1`

	planText := explainPlanText(t, pool, ctx, explainSQL, "%Canon%")
	t.Logf("camera-model EXPLAIN plan:\n%s", planText)

	assert.Contains(t, planText, "idx_assets_exif_model_trgm",
		"the exif-model trigram index must appear in the camera-model filter plan (no seq scan)")
	assert.True(t,
		strings.Contains(planText, "Bitmap Index Scan") || strings.Contains(planText, "Bitmap Heap Scan"),
		"the camera-model filter must use a bitmap index scan, got:\n%s", planText)
}

// TestM167_FilenameSortUsesBtreeNoSort proves ORDER BY filename for a workspace
// is served by the partial composite btree with NO Sort node.
func TestM167_FilenameSortUsesBtreeNoSort(t *testing.T) {
	pool := connectTestDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	disableSeqScan(t, pool, ctx)

	// Mirror the AssetRepo.List sort path: workspace-scoped, active rows, ORDER BY filename.
	const explainSQL = `EXPLAIN
		SELECT id FROM assets
		WHERE workspace_id = $1 AND deleted_at IS NULL
		ORDER BY filename ASC
		LIMIT 50`

	// A fixed UUID is fine — EXPLAIN (no ANALYZE) plans without executing, so the
	// row needn't exist; the planner still reveals which index serves the ordering.
	planText := explainPlanText(t, pool, ctx, explainSQL, "00000000-0000-0000-0000-000000000000")
	t.Logf("filename-sort EXPLAIN plan:\n%s", planText)

	assert.Contains(t, planText, "idx_assets_workspace_filename",
		"ORDER BY filename must be served by the (workspace_id, filename) btree index")
	assert.NotContains(t, planText, "Sort  ",
		"ORDER BY filename must NOT add a Sort node once the btree index serves the ordering")
}

// TestM167_SizeSortUsesBtreeNoSort proves ORDER BY size_bytes for a workspace is
// served by the partial composite btree with NO Sort node.
func TestM167_SizeSortUsesBtreeNoSort(t *testing.T) {
	pool := connectTestDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	disableSeqScan(t, pool, ctx)

	const explainSQL = `EXPLAIN
		SELECT id FROM assets
		WHERE workspace_id = $1 AND deleted_at IS NULL
		ORDER BY size_bytes DESC
		LIMIT 50`

	planText := explainPlanText(t, pool, ctx, explainSQL, "00000000-0000-0000-0000-000000000000")
	t.Logf("size-sort EXPLAIN plan:\n%s", planText)

	assert.Contains(t, planText, "idx_assets_workspace_size",
		"ORDER BY size_bytes must be served by the (workspace_id, size_bytes) btree index")
	assert.NotContains(t, planText, "Sort  ",
		"ORDER BY size_bytes must NOT add a Sort node once the btree index serves the ordering")
}
