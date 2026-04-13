package database_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestM28StudioIdentitySchema(t *testing.T) {
	migrator := newMigrator(t)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	requiredWorkspaceColumns := []string{
		"brand_name",
		"brand_accent_color",
		"public_branding_enabled",
		"logo_asset_id",
		"logo_metadata",
	}

	for _, column := range requiredWorkspaceColumns {
		t.Run(fmt.Sprintf("workspaces.%s", column), func(t *testing.T) {
			var found string
			err := pool.QueryRow(ctx, `
				SELECT column_name
				FROM information_schema.columns
				WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = $1`,
				column,
			).Scan(&found)
			require.NoError(t, err)
			require.Equal(t, column, found)
		})
	}

	var fkName string
	err := pool.QueryRow(ctx, `
		SELECT tc.constraint_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
		  ON tc.constraint_schema = kcu.constraint_schema
		 AND tc.constraint_name = kcu.constraint_name
		WHERE tc.table_schema = 'public'
		  AND tc.table_name = 'workspaces'
		  AND tc.constraint_type = 'FOREIGN KEY'
		  AND kcu.column_name = 'logo_asset_id'
		LIMIT 1`,
	).Scan(&fkName)
	require.NoError(t, err, "logo_asset_id must reference R2-backed assets instead of storing arbitrary public URLs")
	require.NotEmpty(t, fkName)
}
