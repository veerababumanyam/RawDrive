package shortlink_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/rawdrive/backend/internal/streaming/shortlink"
)

// M34-R2-T001 — alphabet guarantees: 8 chars from safe set only.
func TestCodeAlphabet(t *testing.T) {
	alpha := shortlink.Alphabet()
	// Must exclude visually ambiguous chars.
	for _, bad := range []string{"0", "O", "I", "l", "1"} {
		assert.False(t, strings.Contains(alpha, bad), "alphabet must exclude %q", bad)
	}
	assert.Equal(t, 8, shortlink.CodeLength())
}

// M34-R2-T003 — IP hashing: sha256 hex, raw IP never stored.
func TestHashIPIsSha256HexAndNotRaw(t *testing.T) {
	raw := "203.0.113.42"
	h := shortlink.HashIP(raw)
	assert.Len(t, h, 64, "sha256 hex should be 64 chars")
	assert.NotContains(t, h, raw, "raw IP must not appear in hash")
	// Deterministic for same input
	assert.Equal(t, h, shortlink.HashIP(raw))
	// Different input → different hash
	assert.NotEqual(t, h, shortlink.HashIP("198.51.100.7"))
}

// ErrNotFound exported sentinel must exist.
func TestErrNotFoundExists(t *testing.T) {
	assert.NotNil(t, shortlink.ErrNotFound)
	assert.Contains(t, shortlink.ErrNotFound.Error(), "not found")
}
