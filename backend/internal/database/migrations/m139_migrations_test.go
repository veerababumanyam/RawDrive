package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestM139_ClearSeededSMTPDefaultsWhenHostIsEmpty(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "139_clear_seeded_smtp_transport_defaults.up.sql"))
	require.NoError(t, err)
	sql := strings.ToLower(string(body))

	assert.Contains(t, sql, "smtp_port")
	assert.Contains(t, sql, "smtp_security")
	assert.Contains(t, sql, "set value = ''")
	assert.Contains(t, sql, "smtp_host.value = ''",
		"migration 139 must only clear transport defaults when platform_settings has no SMTP host")
	assert.Contains(t, sql, "platform_settings wins over")
	assert.Contains(t, sql, "environment variables",
		"migration comment should preserve why this protects env fallback")
}

func TestM139_DownRestoresOnlyHistoricalSMTPDefaults(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "139_clear_seeded_smtp_transport_defaults.down.sql"))
	require.NoError(t, err)
	sql := strings.ToLower(string(body))

	assert.Contains(t, sql, "set value = '465'")
	assert.Contains(t, sql, "set value = 'ssl'")
	assert.Contains(t, sql, "smtp_host.value = ''",
		"rollback must not overwrite a configured provider host")
	assert.NotContains(t, sql, "smtp_password",
		"migration 139 must never manipulate SMTP credentials")
}
