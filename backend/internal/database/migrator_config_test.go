package database

import (
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewMigrationPoolConfigDisablesPreparedStatementCache(t *testing.T) {
	cfg, err := newMigrationPoolConfig("postgresql://rawdrive:secret@pgbouncer:6432/rawdrive?sslmode=disable")
	require.NoError(t, err)

	assert.Equal(t, pgx.QueryExecModeExec, cfg.ConnConfig.DefaultQueryExecMode)
	assert.EqualValues(t, 1, cfg.MaxConns)
	assert.EqualValues(t, 0, cfg.MinConns)
}
