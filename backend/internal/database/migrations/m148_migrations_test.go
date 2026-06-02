package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestM148_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)

	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "148_lock_known_password_seed_users"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM148_UpLocksKnownPasswordsWithoutDeletingData(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "148_lock_known_password_seed_users.up.sql"))
	require.NoError(t, err)
	content := string(body)
	upper := strings.ToUpper(content)

	for _, password := range []string{"TestPassword123!", "SuperAdmin123!", "Admin123!", "Dealer123!"} {
		assert.Contains(t, content, password, "up must target known password %q", password)
	}

	assert.Contains(t, content, "refresh_sessions", "up must revoke refresh sessions")
	assert.Contains(t, content, "revoked = TRUE", "up must revoke individual refresh sessions")
	assert.Contains(t, content, "family_revoked = TRUE", "up must revoke refresh families")
	assert.Contains(t, content, "!F148-LOCKED-KNOWN-PROD-SEED", "up must replace hashes with a non-bcrypt sentinel")
	assert.Contains(t, content, "must_change_password = TRUE", "up must force a password reset")
	assert.Contains(t, content, "email_verified = CASE", "up must unverify explicit test identities")
	assert.Contains(t, content, "ELSE email_verified", "up must preserve non-test-user email verification state")
	assert.Contains(t, content, "platform_role = CASE", "up must demote explicit test identities")
	assert.Contains(t, content, "ELSE platform_role", "up must not blindly overwrite non-test-user roles")

	assert.NotContains(t, upper, "DELETE FROM USERS", "up must lock users, not delete them")
	assert.NotContains(t, upper, "DELETE FROM WORKSPACES", "up must not cascade-delete accidental production workspaces")
	assert.NotContains(t, upper, "DELETE FROM DEALERS", "up must not delete dealer records")
}

func TestM148_DownIsIntentionalNoop(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "148_lock_known_password_seed_users.down.sql"))
	require.NoError(t, err)
	content := strings.ToUpper(string(body))

	assert.NotContains(t, content, "UPDATE USERS", "down must not restore known passwords or roles")
	assert.NotContains(t, content, "UPDATE REFRESH_SESSIONS", "down must not un-revoke sessions")
	assert.NotContains(t, content, "INSERT INTO USERS", "down must not recreate test users")
}
