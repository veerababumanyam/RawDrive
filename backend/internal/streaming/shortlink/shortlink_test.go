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

// M35-35-5 — ErrRevoked distinct from ErrNotFound so handlers can return 410
// vs 404 without overloading a single sentinel.
func TestErrRevoked_DistinctSentinel(t *testing.T) {
	assert.NotNil(t, shortlink.ErrRevoked)
	assert.NotEqual(t, shortlink.ErrNotFound, shortlink.ErrRevoked)
	assert.Contains(t, shortlink.ErrRevoked.Error(), "revoked")
}

// M35-35-5 — ResolveResult shape: must carry StreamID + nullable RevokedAt +
// reserved ExpiresAt. Prevents regressing to the old (uuid, bool) shape.
func TestResolveResult_StructShape(t *testing.T) {
	var r shortlink.ResolveResult
	// Zero value: no stream, no timestamps.
	assert.Equal(t, "00000000-0000-0000-0000-000000000000", r.StreamID.String())
	assert.Nil(t, r.RevokedAt)
	assert.Nil(t, r.ExpiresAt)
}

// M35-35-5 — NormalizeSrc whitelist: qr|wa|email|invite|direct pass through
// (case-insensitive, trimmed); anything else coerces to "other".
func TestNormalizeSrc_Whitelist(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"qr", "qr"},
		{"wa", "wa"},
		{"email", "email"},
		{"invite", "invite"},
		{"direct", "direct"},
		{"QR", "qr"},
		{"  wa  ", "wa"},
		{"javascript:", "other"},
		{"", "other"},
		{"unknown", "other"},
		{"<script>", "other"},
	}
	for _, c := range cases {
		assert.Equalf(t, c.want, shortlink.NormalizeSrc(c.in), "NormalizeSrc(%q)", c.in)
	}
}
