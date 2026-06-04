package database_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Item 12b — runtime (DB-backed) contract tests asserting that the vector,
// gallery, album, and queue-claim indexes actually EXIST after every migration
// applies. These are TDD-style assertions against a freshly migrated pgvector
// testcontainer (booted by TestMain in migrations_test.go): the assertions ARE
// the test. They guard against a migration being reverted, renumbered away, or
// silently dropping a performance-critical index.
//
// Each pair below names the migration that should create the index so a failure
// points straight at the source-of-truth SQL to inspect.

// assertIndexExists fails the (sub)test with a clear, migration-attributed
// message if `index` does not exist on `table` in the migrated schema.
func assertIndexExists(t *testing.T, table, index, migration string) {
	t.Helper()
	pool := testPool(t)
	ctx := context.Background()

	var got string
	err := pool.QueryRow(ctx,
		`SELECT indexname FROM pg_indexes
		 WHERE schemaname = 'public' AND tablename = $1 AND indexname = $2`,
		table, index).Scan(&got)
	require.NoErrorf(t, err,
		"index %q on table %q (created by migration %s) should exist after all migrations apply",
		index, table, migration)
	assert.Equal(t, index, got)
}

// assertHNSWIndex additionally asserts the index is a pgvector HNSW index by
// checking that its definition (pg_indexes.indexdef) uses the hnsw access
// method. A B-tree index by the same name would not serve approximate nearest
// neighbour vector search, so the method matters as much as the name.
func assertHNSWIndex(t *testing.T, table, index, migration string) {
	t.Helper()
	pool := testPool(t)
	ctx := context.Background()

	var indexDef string
	err := pool.QueryRow(ctx,
		`SELECT indexdef FROM pg_indexes
		 WHERE schemaname = 'public' AND tablename = $1 AND indexname = $2`,
		table, index).Scan(&indexDef)
	require.NoErrorf(t, err,
		"HNSW index %q on table %q (created by migration %s) should exist after all migrations apply",
		index, table, migration)
	assert.Containsf(t, indexDef, "USING hnsw",
		"index %q on %q must be a pgvector HNSW index (migration %s); got: %s",
		index, table, migration, indexDef)
}

// TestIndexContract_VectorHNSW asserts the two pgvector HNSW indexes that back
// semantic photo search and face clustering exist AND use the hnsw method.
func TestIndexContract_VectorHNSW(t *testing.T) {
	migrator := newMigrator(t)
	require.NoError(t, migrator.Up(), "all migrations should apply before asserting vector indexes")

	cases := []struct {
		name      string
		table     string
		index     string
		migration string
	}{
		{
			name:      "assets_embedding",
			table:     "assets",
			index:     "idx_assets_embedding_hnsw",
			migration: "019_assets_ai_columns",
		},
		{
			name:      "face_clusters_embedding",
			table:     "face_clusters",
			index:     "idx_face_clusters_embedding_hnsw",
			migration: "149_face_clusters_embedding_512 (originally 017_pgvector_face_clusters)",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertHNSWIndex(t, tc.table, tc.index, tc.migration)
		})
	}
}

// TestIndexContract_GalleryAlbumHotPath asserts the migration-153 covering
// indexes that serve gallery/album ordered asset lists exist. Without them the
// planner falls back to a Sort on every gallery/album open (the June 2026
// performance audit regression these indexes fixed).
func TestIndexContract_GalleryAlbumHotPath(t *testing.T) {
	migrator := newMigrator(t)
	require.NoError(t, migrator.Up(), "all migrations should apply before asserting gallery/album indexes")

	cases := []struct {
		name      string
		table     string
		index     string
		migration string
	}{
		{
			name:      "gallery_assets_gallery_sort",
			table:     "gallery_assets",
			index:     "idx_gallery_assets_gallery_sort",
			migration: "153_gallery_asset_hot_path_indexes",
		},
		{
			name:      "album_assets_album_position",
			table:     "album_assets",
			index:     "idx_album_assets_album_position",
			migration: "153_gallery_asset_hot_path_indexes",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertIndexExists(t, tc.table, tc.index, tc.migration)
		})
	}
}

// TestIndexContract_QueueClaim asserts the partial indexes that back each
// background worker's atomic FOR UPDATE SKIP LOCKED claim scan exist. These
// shipped in the atomic-lease wave (migrations 155–160); a missing index turns
// every claim scan into a sequential scan under concurrent worker load.
func TestIndexContract_QueueClaim(t *testing.T) {
	migrator := newMigrator(t)
	require.NoError(t, migrator.Up(), "all migrations should apply before asserting queue-claim indexes")

	cases := []struct {
		name      string
		table     string
		index     string
		migration string
	}{
		{
			name:      "gallery_email_events",
			table:     "gallery_email_events",
			index:     "idx_gallery_email_events_claim",
			migration: "155_gallery_email_events_claimed_at",
		},
		{
			name:      "dsr_requests",
			table:     "dsr_requests",
			index:     "idx_dsr_requests_claim",
			migration: "156_dsr_requests_claimed_at",
		},
		{
			name:      "webhook_deliveries",
			table:     "webhook_deliveries",
			index:     "idx_webhook_deliveries_claim",
			migration: "157_webhook_deliveries_claimed_at",
		},
		{
			name:      "download_jobs",
			table:     "download_jobs",
			index:     "idx_download_jobs_claim",
			migration: "158_download_jobs_claimed_at",
		},
		{
			name:      "assets_derivative",
			table:     "assets",
			index:     "idx_assets_derivative_claim",
			migration: "159_assets_claimed_at",
		},
		{
			name:      "ai_jobs",
			table:     "ai_jobs",
			index:     "idx_ai_jobs_claim",
			migration: "160_ai_jobs_claimed_at",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertIndexExists(t, tc.table, tc.index, tc.migration)
		})
	}
}
