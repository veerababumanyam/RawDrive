package migrations_test

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var m7Migrations = []struct {
	Number      string
	Description string
}{
	{"029", "create_m7_admin_views"},
	{"030", "create_m7_moderation_queue"},
	{"031", "create_m7_revenue_views"},
	{"032", "create_m7_bi_analytics_views"},
	{"033", "create_m7_system_metrics"},
	{"034", "alter_m7_audit_logs"},
}

func migrationDir(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	require.NoError(t, err)

	entries, err := os.ReadDir(dir)
	require.NoError(t, err)

	hasMigrations := false
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".up.sql") {
			hasMigrations = true
			break
		}
	}
	require.True(t, hasMigrations, "test must run from migrations directory; cwd=%s", dir)
	return dir
}

func TestM7MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)

	for _, m := range m7Migrations {
		upFile := fmt.Sprintf("%s_%s.up.sql", m.Number, m.Description)
		downFile := fmt.Sprintf("%s_%s.down.sql", m.Number, m.Description)

		t.Run(upFile, func(t *testing.T) {
			path := filepath.Join(dir, upFile)
			info, err := os.Stat(path)
			require.NoError(t, err, "UP migration file must exist: %s", upFile)
			assert.Greater(t, info.Size(), int64(0), "UP migration must not be empty")
		})

		t.Run(downFile, func(t *testing.T) {
			path := filepath.Join(dir, downFile)
			info, err := os.Stat(path)
			require.NoError(t, err, "DOWN migration file must exist: %s", downFile)
			assert.Greater(t, info.Size(), int64(0), "DOWN migration must not be empty")
		})
	}
}

func TestM7MigrationNamingConvention(t *testing.T) {
	dir := migrationDir(t)
	pattern := regexp.MustCompile(`^\d{3,6}_[a-z0-9_]+\.(up|down)\.sql$`)

	entries, err := os.ReadDir(dir)
	require.NoError(t, err)

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		t.Run(e.Name(), func(t *testing.T) {
			assert.True(t, pattern.MatchString(e.Name()),
				"migration filename %q does not match pattern NNN_description.{up|down}.sql", e.Name())
		})
	}
}

func TestM7MigrationPairsComplete(t *testing.T) {
	dir := migrationDir(t)

	entries, err := os.ReadDir(dir)
	require.NoError(t, err)

	ups := make(map[string]bool)
	downs := make(map[string]bool)

	for _, e := range entries {
		name := e.Name()
		if strings.HasSuffix(name, ".up.sql") {
			base := strings.TrimSuffix(name, ".up.sql")
			ups[base] = true
		} else if strings.HasSuffix(name, ".down.sql") {
			base := strings.TrimSuffix(name, ".down.sql")
			downs[base] = true
		}
	}

	for base := range ups {
		t.Run("down_exists_for_"+base, func(t *testing.T) {
			assert.True(t, downs[base], "missing DOWN migration for %s.up.sql", base)
		})
	}

	for base := range downs {
		t.Run("up_exists_for_"+base, func(t *testing.T) {
			assert.True(t, ups[base], "missing UP migration for %s.down.sql", base)
		})
	}
}

func TestM7MigrationSQLSyntaxBasic(t *testing.T) {
	dir := migrationDir(t)

	for _, m := range m7Migrations {
		for _, direction := range []string{"up", "down"} {
			filename := fmt.Sprintf("%s_%s.%s.sql", m.Number, m.Description, direction)
			t.Run(filename, func(t *testing.T) {
				path := filepath.Join(dir, filename)
				content, err := os.ReadFile(path)
				require.NoError(t, err)

				sql := string(content)
				trimmed := strings.TrimSpace(sql)
				assert.NotEmpty(t, trimmed, "migration file must not be empty")

				beginCount := strings.Count(strings.ToUpper(sql), "BEGIN")
				commitCount := strings.Count(strings.ToUpper(sql), "COMMIT")
				assert.Equal(t, beginCount, commitCount,
					"unbalanced BEGIN/COMMIT in %s (BEGIN=%d, COMMIT=%d)", filename, beginCount, commitCount)

				assert.NotContains(t, sql, ";;", "double semicolons found in %s", filename)

				if direction == "up" {
					upper := strings.ToUpper(sql)
					hasCreate := strings.Contains(upper, "CREATE")
					hasAlter := strings.Contains(upper, "ALTER")
					hasInsert := strings.Contains(upper, "INSERT")
					assert.True(t, hasCreate || hasAlter || hasInsert,
						"UP migration %s should contain CREATE, ALTER, or INSERT", filename)
				}

				if direction == "down" {
					upper := strings.ToUpper(sql)
					hasDrop := strings.Contains(upper, "DROP")
					hasAlter := strings.Contains(upper, "ALTER")
					hasDisable := strings.Contains(upper, "DISABLE")
					assert.True(t, hasDrop || hasAlter || hasDisable,
						"DOWN migration %s should contain DROP, ALTER, or DISABLE", filename)
				}
			})
		}
	}
}

func TestM7MigrationSequentialNumbering(t *testing.T) {
	for i, m := range m7Migrations {
		expected := fmt.Sprintf("%03d", 29+i)
		assert.Equal(t, expected, m.Number,
			"M7 migration %d should be numbered %s, got %s", i, expected, m.Number)
	}
}
