package database_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestM26StudioProjectsSchemaAndLinks(t *testing.T) {
	migrator := newMigrator(t)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	requiredColumns := map[string][]string{
		"studio_projects": {
			"id", "workspace_id", "contact_id", "lead_id", "source_deal_id", "package_id",
			"name", "project_type", "status", "event_date", "expected_value_paisa",
			"booked_value_paisa", "balance_due_paisa", "contract_status", "gallery_status",
			"next_action", "next_action_due_at", "notes", "created_at", "updated_at", "archived_at",
		},
		"events":     {"project_id"},
		"invoices":   {"project_id"},
		"contracts":  {"project_id"},
		"galleries":  {"contact_id", "project_id"},
		"follow_ups": {"project_id"},
		"payments":   {"project_id"},
	}

	for table, columns := range requiredColumns {
		for _, column := range columns {
			t.Run(fmt.Sprintf("%s.%s", table, column), func(t *testing.T) {
				var found string
				err := pool.QueryRow(ctx, `
					SELECT column_name
					FROM information_schema.columns
					WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
					table, column,
				).Scan(&found)
				require.NoError(t, err)
				require.Equal(t, column, found)
			})
		}
	}

	var rlsEnabled bool
	err := pool.QueryRow(ctx, `SELECT relrowsecurity FROM pg_class WHERE relname = 'studio_projects'`).Scan(&rlsEnabled)
	require.NoError(t, err)
	require.True(t, rlsEnabled, "studio_projects must enforce workspace RLS")
}
