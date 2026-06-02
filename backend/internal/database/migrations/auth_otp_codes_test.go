package migrations_test

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func normalizeAuthOTPSQL(sql string) string {
	return regexp.MustCompile(`\s+`).ReplaceAllString(strings.ToLower(sql), " ")
}

func TestAuthOTPCodesMigration(t *testing.T) {
	dir := migrationDir(t)
	up, err := os.ReadFile(filepath.Join(dir, "136_auth_otp_codes.up.sql"))
	require.NoError(t, err)
	normalized := normalizeAuthOTPSQL(string(up))

	assert.Contains(t, normalized, "create table if not exists auth_otp_codes")
	assert.Contains(t, normalized, "purpose text not null")
	assert.Contains(t, normalized, "identifier text not null")
	assert.Contains(t, normalized, "code_hash text not null")
	assert.Contains(t, normalized, "idx_auth_otp_codes_active")
	assert.Contains(t, normalized, "where used_at is null")
}

func TestAuthOTPCodesDownMigration(t *testing.T) {
	dir := migrationDir(t)
	down, err := os.ReadFile(filepath.Join(dir, "136_auth_otp_codes.down.sql"))
	require.NoError(t, err)
	normalized := normalizeAuthOTPSQL(string(down))

	assert.Contains(t, normalized, "drop table if exists auth_otp_codes")
}
