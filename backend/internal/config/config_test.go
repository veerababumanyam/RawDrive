package config_test

import (
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/config"
)

func TestLoadConfigFromEnv(t *testing.T) {
	// Set all required env vars
	t.Setenv("DATABASE_URL", "postgres://rawdrive_user:test@localhost:55070/rawdrive_db?sslmode=disable")
	t.Setenv("VALKEY_URL", "localhost:64089")
	t.Setenv("NATS_URL", "nats://localhost:4222")
	t.Setenv("JWT_PRIVATE_KEY_PATH", "/tmp/test_private.pem")
	t.Setenv("JWT_PUBLIC_KEY_PATH", "/tmp/test_public.pem")

	cfg, err := config.Load()
	require.NoError(t, err, "config should load when all required env vars are set")

	assert.Equal(t, "postgres://rawdrive_user:test@localhost:55070/rawdrive_db?sslmode=disable", cfg.DatabaseURL)
	assert.Equal(t, "localhost:64089", cfg.ValkeyURL)
	assert.Equal(t, "nats://localhost:4222", cfg.NATSURL)
	assert.Equal(t, "/tmp/test_private.pem", cfg.JWTPrivateKeyPath)
	assert.Equal(t, "/tmp/test_public.pem", cfg.JWTPublicKeyPath)
}

func TestMissingDatabaseURL(t *testing.T) {
	// Clear DATABASE_URL to simulate missing config
	t.Setenv("DATABASE_URL", "")
	os.Unsetenv("DATABASE_URL")

	assert.Panics(t, func() {
		_, _ = config.Load()
	}, "config.Load should panic when DATABASE_URL is missing")
}

func TestJWTKeyPairLoading(t *testing.T) {
	// Create temporary key files for testing
	privKey := []byte(`-----BEGIN RSA PRIVATE KEY-----
MIIBogIBAAJBALRiMLAH...test key data...
-----END RSA PRIVATE KEY-----`)
	pubKey := []byte(`-----BEGIN PUBLIC KEY-----
MFwwDQYJKoZIhvcNAQEB...test key data...
-----END PUBLIC KEY-----`)

	privFile, err := os.CreateTemp(t.TempDir(), "priv-*.pem")
	require.NoError(t, err)
	_, err = privFile.Write(privKey)
	require.NoError(t, err)
	require.NoError(t, privFile.Close())

	pubFile, err := os.CreateTemp(t.TempDir(), "pub-*.pem")
	require.NoError(t, err)
	_, err = pubFile.Write(pubKey)
	require.NoError(t, err)
	require.NoError(t, pubFile.Close())

	t.Setenv("DATABASE_URL", "postgres://localhost/test")
	t.Setenv("JWT_PRIVATE_KEY_PATH", privFile.Name())
	t.Setenv("JWT_PUBLIC_KEY_PATH", pubFile.Name())

	cfg, err := config.Load()
	require.NoError(t, err)
	assert.NotNil(t, cfg.JWTPrivateKey, "RS256 private key should be loaded from file")
	assert.NotNil(t, cfg.JWTPublicKey, "RS256 public key should be loaded from file")
}

func TestDefaultValues(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/test")
	// Do not set optional env vars — defaults should apply

	cfg, err := config.Load()
	require.NoError(t, err)

	assert.Equal(t, 8080, cfg.Port, "default port should be 8080")
	assert.Equal(t, "development", cfg.Environment, "default environment should be development")
	assert.Equal(t, 5*time.Minute, cfg.OTPExpiry, "default OTP expiry should be 5 minutes")
	assert.Equal(t, 5, cfg.MaxConcurrentSessions, "default max concurrent sessions should be 5")
}

func TestOTPExpiryConfig(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/test")
	t.Setenv("OTP_EXPIRY_MINUTES", "10")

	cfg, err := config.Load()
	require.NoError(t, err)
	assert.Equal(t, 10*time.Minute, cfg.OTPExpiry, "OTP expiry should be configurable via env var")
}
