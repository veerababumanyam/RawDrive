package m5_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func getTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgresql://rawdrive_user:e706fbd6b28d036aa80379447729737b@localhost:55070/rawdrive_db?sslmode=disable"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
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
