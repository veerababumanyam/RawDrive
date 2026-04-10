package storage_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/storage"
)

// Tests for F-008 (audit 2026-04-10) + CLAUDE.md hardcode law #1:
// The production factory must refuse to construct a local-disk storage
// provider. RawDrive is R2-only in production; the local driver exists only
// for unit tests which call NewLocalDriver directly. Going through
// NewProvider with Driver="local" — which is what STORAGE_DRIVER=local does
// at startup — is explicitly forbidden and must fail fast with a clear
// hardcode-law reference so operators know why.

func TestNewProvider_LocalDriverRejected_HardcodeLaw1(t *testing.T) {
	_, err := storage.NewProvider(storage.Config{
		Driver:   "local",
		LocalDir: "/tmp/rawdrive-never",
	})
	require.Error(t, err, "factory must refuse to construct the local driver")

	msg := strings.ToLower(err.Error())
	assert.Contains(t, msg, "local",
		"error must name the offending driver so ops can diagnose")
	// Must mention either the hardcode law or F-008 so greppers find the why.
	assert.True(t,
		strings.Contains(msg, "hardcode") ||
			strings.Contains(msg, "f-008") ||
			strings.Contains(msg, "production"),
		"error must reference the hardcode law / audit finding / production posture; got: %s",
		err.Error())
}

func TestNewProvider_S3DriverStillAccepted(t *testing.T) {
	// F-008 must NOT break the S3/R2 path — that's the only supported path.
	// This uses NewProvider end-to-end but passes an obviously fake creds set.
	// A real construction of the S3 client may fail later (network/creds),
	// but the factory must at minimum accept the Config shape.
	_, err := storage.NewProvider(storage.Config{
		Driver:    "s3",
		Bucket:    "fake-bucket-f008-test",
		Region:    "us-east-1",
		AccessKey: "fake-access-key",
		SecretKey: "fake-secret-key",
	})
	// S3 client construction may succeed with fake creds (lazy auth) or may
	// return a non-local error. Either way, the "local hardcode law" error
	// must NOT appear here — that would mean we regressed the good path.
	if err != nil {
		assert.NotContains(t, strings.ToLower(err.Error()), "hardcode",
			"S3 factory path must not emit the local-driver hardcode error")
	}
}
