package m5_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/database"
	"github.com/rawdrive/backend/tests/testsupport"
)

// testDSN is resolved by TestMain to either DATABASE_URL (preserved escape
// hatch for running against a real DB for forensics) or the DSN of a
// throwaway pgvector testcontainer managed by testsupport.
var testDSN string

// testcontainerSkipReason is non-empty when TestMain could not resolve a
// usable DSN — typically because Docker Desktop on a dev machine does not
// expose the named-pipe/rootless mode testcontainers-go needs. In that
// state getTestDB skips the calling test cleanly instead of exploding
// with a hard failure, matching the convention in tests/brownfield/*.
var testcontainerSkipReason string

// TestMain resolves the DSN for this test binary and cleans up the
// testcontainer (if one was started) at exit.
//
// The previous version hardcoded postgresql://...@localhost:55070/... and
// required docker-compose to be running. It also kept its own sync.Once
// around migrator.Up() — now redundant because testsupport guarantees
// exactly-once migration as part of container init.
//
// If DATABASE_URL is unset AND testsupport.EnsureDSN cannot boot a
// container, TestMain records the reason and still runs the suite — every
// DB-backed test will skip via getTestDB and the package reports SKIP
// instead of FAIL. This preserves CI parity (CI sets DATABASE_URL so the
// full suite runs) while keeping dev machines that lack Docker unblocked.
func TestMain(m *testing.M) {
	if envDSN := os.Getenv("DATABASE_URL"); envDSN != "" {
		// Strict parity with the previous version: run migrations against
		// the env-supplied DSN. Migrations are idempotent (gated by
		// schema_migrations), so this is a no-op against an already-migrated
		// target but protects fresh ones.
		if err := database.NewMigrator(envDSN).Up(); err != nil {
			fmt.Fprintf(os.Stderr, "m5_test: failed to migrate DATABASE_URL target: %v\n", err)
			os.Exit(1)
		}
		testDSN = envDSN
	} else {
		dsn, err := testsupport.EnsureDSN()
		if err != nil {
			testcontainerSkipReason = fmt.Sprintf("testcontainer unavailable: %v", err)
			fmt.Fprintf(os.Stderr, "m5_test: %s — DB-backed tests will skip\n", testcontainerSkipReason)
		} else {
			testDSN = dsn
		}
	}

	code := m.Run()
	testsupport.Shutdown()
	os.Exit(code)
}

// getTestDB returns a pool connected to the DSN resolved by TestMain. It
// does NOT re-run migrations — testsupport.EnsureDSN already did that.
// When the testcontainer could not be started, it skips the caller.
func getTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if testcontainerSkipReason != "" {
		t.Skip(testcontainerSkipReason)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, testDSN)
	require.NoError(t, err, "Failed to connect to test database")
	t.Cleanup(func() { pool.Close() })
	return pool
}

// ──────────────────────────── Migration 000014: Marketplace Tables ────────────────────────────

func TestMigration014_FreelancerListingsTableExists(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_name = 'freelancer_listings'
		)
	`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "freelancer_listings table should exist")
}

func TestMigration014_FreelancerListingsColumns(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	expectedCols := []string{
		"id", "user_id", "workspace_id", "state_id", "title",
		"specializations", "city", "daily_rate_paisa", "description",
		"portfolio_gallery_id", "availability_calendar", "is_published",
		"rating_avg", "review_count", "created_at", "updated_at",
	}
	for _, col := range expectedCols {
		var colExists bool
		err := pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT FROM information_schema.columns
				WHERE table_name = 'freelancer_listings' AND column_name = $1
			)
		`, col).Scan(&colExists)
		require.NoError(t, err)
		assert.True(t, colExists, "freelancer_listings should have column: %s", col)
	}
}

func TestMigration014_FreelancerReviewsTableExists(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_name = 'freelancer_reviews'
		)
	`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "freelancer_reviews table should exist")
}

func TestMigration014_MarketplaceInquiriesTableExists(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_name = 'marketplace_inquiries'
		)
	`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "marketplace_inquiries table should exist")
}

func TestMigration014_SpecializationsGINIndex(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM pg_indexes
			WHERE tablename = 'freelancer_listings'
			AND indexdef LIKE '%gin%'
			AND indexdef LIKE '%specializations%'
		)
	`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "GIN index should exist on freelancer_listings.specializations")
}

func TestMigration014_StateCityPartialIndex(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM pg_indexes
			WHERE tablename = 'freelancer_listings'
			AND indexdef LIKE '%state_id%'
			AND indexdef LIKE '%city%'
			AND indexdef LIKE '%is_published%'
		)
	`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "Partial index on (state_id, city) WHERE is_published should exist")
}

// ──────────────────────────── Migration 000015: Gear Tables ────────────────────────────

func TestMigration015_GearListingsTableExists(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_name = 'gear_listings'
		)
	`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "gear_listings table should exist")
}

func TestMigration015_GearListingsColumns(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	expectedCols := []string{
		"id", "user_id", "workspace_id", "state_id", "listing_type",
		"title", "category", "brand", "model", "condition",
		"price_paisa", "description", "images", "city",
		"is_published", "is_available", "availability_calendar",
		"created_at", "updated_at",
	}
	for _, col := range expectedCols {
		var colExists bool
		err := pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT FROM information_schema.columns
				WHERE table_name = 'gear_listings' AND column_name = $1
			)
		`, col).Scan(&colExists)
		require.NoError(t, err)
		assert.True(t, colExists, "gear_listings should have column: %s", col)
	}
}

func TestMigration015_GearBookingsTableExists(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_name = 'gear_bookings'
		)
	`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "gear_bookings table should exist")
}

func TestMigration015_GearCategoryBrandIndex(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM pg_indexes
			WHERE tablename = 'gear_listings'
			AND indexdef LIKE '%category%'
			AND indexdef LIKE '%brand%'
		)
	`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "Index on (category, brand) should exist on gear_listings")
}

// ──────────────────────────── Migration 000016: Messaging Tables ────────────────────────────

func TestMigration016_ChannelsTableExists(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_name = 'channels'
		)
	`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "channels table should exist")
}

func TestMigration016_ChannelMembersTableExists(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_name = 'channel_members'
		)
	`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "channel_members table should exist")
}

func TestMigration016_MessagesTableExists(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_name = 'messages'
		)
	`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "messages table should exist")
}

func TestMigration016_MessagesColumns(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	expectedCols := []string{
		"id", "workspace_id", "channel_id", "sender_id",
		"message_type", "body", "attachment_url", "parent_message_id",
		"is_read", "edited_at", "deleted_at", "inserted_at",
	}
	for _, col := range expectedCols {
		var colExists bool
		err := pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT FROM information_schema.columns
				WHERE table_name = 'messages' AND column_name = $1
			)
		`, col).Scan(&colExists)
		require.NoError(t, err)
		assert.True(t, colExists, "messages should have column: %s", col)
	}
}

func TestMigration016_MessagesFullTextSearchIndex(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM pg_indexes
			WHERE tablename = 'messages'
			AND indexdef LIKE '%gin%'
			AND (indexdef LIKE '%search_vector%' OR indexdef LIKE '%tsvector%' OR indexdef LIKE '%body%')
		)
	`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "GIN full-text search index should exist on messages")
}

func TestMigration016_MessagesChannelIndex(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM pg_indexes
			WHERE tablename = 'messages'
			AND indexdef LIKE '%channel_id%'
		)
	`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "Index on channel_id should exist on messages")
}

// ──────────────────────────── Migration 000017: Moderation Tables ────────────────────────────

func TestMigration017_ModerationQueueTableExists(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_name = 'moderation_queue'
		)
	`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "moderation_queue table should exist")
}

func TestMigration017_ModerationRulesTableExists(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_name = 'moderation_rules'
		)
	`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "moderation_rules table should exist")
}

// ──────────────────────────── RLS Policies ────────────────────────────

func TestRLS_FreelancerListingsPolicy(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var rlsEnabled bool
	err := pool.QueryRow(ctx, `
		SELECT relrowsecurity FROM pg_class WHERE relname = 'freelancer_listings'
	`).Scan(&rlsEnabled)
	require.NoError(t, err)
	assert.True(t, rlsEnabled, "RLS should be enabled on freelancer_listings")
}

func TestRLS_GearListingsPolicy(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var rlsEnabled bool
	err := pool.QueryRow(ctx, `
		SELECT relrowsecurity FROM pg_class WHERE relname = 'gear_listings'
	`).Scan(&rlsEnabled)
	require.NoError(t, err)
	assert.True(t, rlsEnabled, "RLS should be enabled on gear_listings")
}

func TestRLS_MessagesPolicy(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var rlsEnabled bool
	err := pool.QueryRow(ctx, `
		SELECT relrowsecurity FROM pg_class WHERE relname = 'messages'
	`).Scan(&rlsEnabled)
	require.NoError(t, err)
	assert.True(t, rlsEnabled, "RLS should be enabled on messages")
}

func TestRLS_ChannelsPolicy(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	var rlsEnabled bool
	err := pool.QueryRow(ctx, `
		SELECT relrowsecurity FROM pg_class WHERE relname = 'channels'
	`).Scan(&rlsEnabled)
	require.NoError(t, err)
	assert.True(t, rlsEnabled, "RLS should be enabled on channels")
}
