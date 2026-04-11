package database_test

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAllIndianStatesSeeded(t *testing.T) {
	migrator := newMigrator(t)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	var count int
	err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM states WHERE type = 'state'`).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 28, count, "there should be exactly 28 Indian states")
}

func TestAllUnionTerritoriesSeeded(t *testing.T) {
	migrator := newMigrator(t)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	var count int
	err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM states WHERE type = 'union_territory'`).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 8, count, "there should be exactly 8 union territories")
}

func TestStateCodesISO(t *testing.T) {
	migrator := newMigrator(t)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	rows, err := pool.Query(ctx, `SELECT code FROM states`)
	require.NoError(t, err)
	defer rows.Close()

	var codes []string
	for rows.Next() {
		var code string
		require.NoError(t, rows.Scan(&code))
		codes = append(codes, code)
	}
	require.NoError(t, rows.Err())
	require.NotEmpty(t, codes, "states table should have rows")

	for _, code := range codes {
		// ISO 3166-2:IN format: "IN-XX" where XX is 2-3 uppercase letters
		assert.True(t, strings.HasPrefix(code, "IN-"),
			"state code %q should start with 'IN-'", code)
		suffix := strings.TrimPrefix(code, "IN-")
		assert.NotEmpty(t, suffix, "state code %q should have a suffix after 'IN-'", code)
		assert.LessOrEqual(t, len(suffix), 3, "state code suffix %q should be 2-3 chars", suffix)
		assert.GreaterOrEqual(t, len(suffix), 2, "state code suffix %q should be 2-3 chars", suffix)
		for _, ch := range suffix {
			assert.True(t, ch >= 'A' && ch <= 'Z',
				"state code suffix char %c in %q should be uppercase letter", ch, code)
		}
	}
}

func TestStateNamesNotEmpty(t *testing.T) {
	migrator := newMigrator(t)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	rows, err := pool.Query(ctx, `SELECT id, name FROM states`)
	require.NoError(t, err)
	defer rows.Close()

	rowCount := 0
	for rows.Next() {
		var id int
		var name string
		require.NoError(t, rows.Scan(&id, &name))
		assert.NotEmpty(t, name, "state with id %d should have a non-empty name", id)
		rowCount++
	}
	require.NoError(t, rows.Err())
	assert.Equal(t, 36, rowCount, "should have 36 total state/UT rows")
}
