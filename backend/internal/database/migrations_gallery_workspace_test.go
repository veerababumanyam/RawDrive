package database_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestM27GalleryWorkspaceSchemaAndLinks(t *testing.T) {
	migrator := newMigrator(t)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	requiredGalleryColumns := []string{
		"primary_contact_id",
		"event_id",
		"deal_id",
		"invoice_id",
		"published_at",
		"archived_at",
	}

	for _, column := range requiredGalleryColumns {
		t.Run(fmt.Sprintf("galleries.%s", column), func(t *testing.T) {
			var found string
			err := pool.QueryRow(ctx, `
				SELECT column_name
				FROM information_schema.columns
				WHERE table_schema = 'public' AND table_name = 'galleries' AND column_name = $1`,
				column,
			).Scan(&found)
			require.NoError(t, err)
			require.Equal(t, column, found)
		})
	}

	requiredIndexes := []string{
		"idx_galleries_workspace_primary_contact",
		"idx_galleries_workspace_event",
		"idx_galleries_workspace_deal",
		"idx_galleries_workspace_invoice",
		"idx_galleries_workspace_publication",
	}

	for _, index := range requiredIndexes {
		t.Run(index, func(t *testing.T) {
			var found string
			err := pool.QueryRow(ctx, `
				SELECT indexname
				FROM pg_indexes
				WHERE schemaname = 'public' AND tablename = 'galleries' AND indexname = $1`,
				index,
			).Scan(&found)
			require.NoError(t, err)
			require.Equal(t, index, found)
		})
	}
}
