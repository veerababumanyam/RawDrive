package repository

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Q-4 — keyset (seek) pagination of the workspace asset grid, DB-backed.
//
// These tests prove the runtime behaviour the query-shape unit tests in
// asset_repo_test.go can only approximate:
//
//   1. Paging the full result set with cursors yields every row exactly once,
//      in stable created_at DESC order, with NO overlap or gaps across pages.
//   2. A deep page does NOT re-scan skipped rows: EXPLAIN shows the keyset query
//      using the idx_assets_workspace_created index range scan rather than a
//      Seq Scan / full Sort, so latency is flat regardless of page depth (the
//      defect Q-4 fixes — OFFSET re-scanned every skipped row, O(offset)).
//
// They reuse the package TestMain DSN + the seed/workspace helpers from
// asset_repo_retry_test.go, and SKIP (not fail) when no DB is reachable — the
// same hermetic-CI convention as the retry integration tests.

// seedAssetAt inserts a single live asset for a workspace at an explicit
// created_at so page ordering is deterministic. Returns the new id.
func seedAssetAt(t *testing.T, ctx context.Context, repo *AssetRepo, workspaceID uuid.UUID, createdAt time.Time) uuid.UUID {
	t.Helper()
	assetID := uuid.New()
	_, err := repo.Pool().Exec(ctx,
		`INSERT INTO assets (id, workspace_id, filename, content_type, size_bytes, storage_key,
		   status, created_at, updated_at)
		 VALUES ($1, $2, $3, 'image/jpeg', 1024, $4, 'ready', $5, $5)`,
		assetID, workspaceID,
		"keyset_"+uuid.NewString()+".jpg",
		"ws/"+workspaceID.String()+"/keyset_"+uuid.NewString(),
		createdAt)
	require.NoError(t, err)
	return assetID
}

// TestList_Keyset_PagesCoverAllRowsWithoutOverlap walks the full set one page at
// a time using next-cursors and asserts every seeded asset appears exactly once
// in stable created_at DESC order.
func TestList_Keyset_PagesCoverAllRowsWithoutOverlap(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAssetRepo(pool)
	ctx := context.Background()
	ws := newRetryWorkspace(t, ctx, repo, "Keyset Pages")

	// 25 assets, strictly decreasing created_at so DESC order is well-defined.
	const total = 25
	base := time.Now().UTC().Truncate(time.Microsecond)
	want := make([]uuid.UUID, 0, total)
	for i := 0; i < total; i++ {
		// Newest first in our expected list (created_at DESC).
		id := seedAssetAt(t, ctx, repo, ws, base.Add(-time.Duration(i)*time.Second))
		want = append(want, id)
	}

	const pageSize = 7
	got := make([]uuid.UUID, 0, total)
	seen := map[uuid.UUID]bool{}
	var cursor *AssetCursor
	pages := 0
	for {
		pages++
		require.LessOrEqual(t, pages, 100, "pagination must terminate")

		// Over-fetch by one (as the handler does) to detect a next page.
		page, err := repo.List(ctx, AssetFilter{
			WorkspaceID: ws,
			Limit:       pageSize + 1,
			Cursor:      cursor,
		})
		require.NoError(t, err)

		hasMore := len(page) > pageSize
		if hasMore {
			page = page[:pageSize]
		}
		for _, a := range page {
			assert.False(t, seen[a.ID], "row %s returned on more than one page (overlap)", a.ID)
			seen[a.ID] = true
			got = append(got, a.ID)
		}
		if !hasMore || len(page) == 0 {
			break
		}
		last := page[len(page)-1]
		cursor = &AssetCursor{CreatedAt: last.CreatedAt, ID: last.ID}
	}

	// Every row exactly once, in the exact created_at DESC order we seeded.
	assert.Equal(t, want, got, "keyset paging must return every row exactly once in stable created_at DESC order")
	assert.Len(t, got, total, "no rows missing or duplicated across pages")
}

// TestList_Keyset_DeepPageUsesIndexSeekNotRescan is the flat-latency proof: the
// keyset query for a DEEP page plans an index scan over
// idx_assets_workspace_created (no Seq Scan, no full Sort), so it seeks
// straight to the cursor instead of scanning + discarding skipped rows the way
// OFFSET did.
func TestList_Keyset_DeepPageUsesIndexSeekNotRescan(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAssetRepo(pool)
	ctx := context.Background()
	ws := newRetryWorkspace(t, ctx, repo, "Keyset Explain")

	// Enough rows that the planner prefers the index over a seq scan, and a
	// "deep" cursor far into the set.
	const total = 400
	base := time.Now().UTC().Truncate(time.Microsecond)
	var deepCursor *AssetCursor
	for i := 0; i < total; i++ {
		ts := base.Add(-time.Duration(i) * time.Second)
		id := seedAssetAt(t, ctx, repo, ws, ts)
		if i == 350 { // a deep position
			deepCursor = &AssetCursor{CreatedAt: ts, ID: id}
		}
	}
	require.NotNil(t, deepCursor)
	// Nudge the planner with fresh stats for this brand-new workspace's rows.
	_, _ = pool.Exec(ctx, `ANALYZE assets`)

	// Build the exact keyset query the repo issues for a deep page.
	q, args := buildAssetListQuery(AssetFilter{
		WorkspaceID: ws,
		Limit:       50,
		Cursor:      deepCursor,
	})
	require.NotContains(t, q, "OFFSET", "guard: deep keyset page must not use OFFSET")

	rows, err := pool.Query(ctx, "EXPLAIN "+q, args...)
	require.NoError(t, err)
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
	t.Logf("deep-page keyset EXPLAIN:\n%s", planText)

	// The keyset seek must ride the workspace_created index, not a full table
	// scan. (A Seq Scan here would mean we are scanning + discarding rows — the
	// O(offset) behaviour Q-4 eliminates.)
	assert.Contains(t, planText, "idx_assets_workspace_created",
		"deep keyset page must use idx_assets_workspace_created (index seek), not a full scan")
	assert.NotContains(t, planText, "Seq Scan on assets",
		"deep keyset page must NOT sequentially scan assets")
}
