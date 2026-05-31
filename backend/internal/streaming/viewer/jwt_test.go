package viewer_test

// M30 / E100-S2 — Viewer session JWT issuance and verification.

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/streaming/viewer"
)

// signingKey is a deterministic HMAC secret for tests. The real viewer
// signing key lives in platform_settings (KEK-encrypted) and is loaded
// during bootstrap.
func testConfig() viewer.Config {
	return viewer.Config{
		SigningKey:  []byte("test-viewer-signing-key-32-bytes-XX"),
		SlidingTTL:  15 * time.Minute,
		MaxLifetime: 4 * time.Hour,
		Issuer:      "rawdrive-viewer",
	}
}

func TestIssueSession_ReturnsTokenPairWithExpectedClaims(t *testing.T) {
	svc := viewer.NewService(testConfig())
	streamID := uuid.NewString()

	pair, err := svc.IssueSession(streamID, viewer.AccessLevelPIN)
	require.NoError(t, err)
	require.NotNil(t, pair)
	require.NotEmpty(t, pair.AccessToken, "access token must be issued")
	require.NotEmpty(t, pair.RefreshToken, "refresh token must be issued")
	assert.NotEqual(t, pair.AccessToken, pair.RefreshToken)
	assert.Equal(t, int64(15*60), pair.ExpiresIn, "sliding TTL = 15 min")

	claims, err := svc.Parse(pair.AccessToken)
	require.NoError(t, err)
	assert.Equal(t, streamID, claims.StreamID)
	assert.Equal(t, viewer.AccessLevelPIN, claims.AccessLevel)
	assert.NotEmpty(t, claims.ViewerSessionID, "viewer_session_id must be set")
}

func TestIssueSession_RejectsEmptyStreamID(t *testing.T) {
	svc := viewer.NewService(testConfig())
	pair, err := svc.IssueSession("", viewer.AccessLevelPIN)
	assert.Error(t, err)
	assert.Nil(t, pair)
}

func TestParse_RejectsTamperedToken(t *testing.T) {
	svc := viewer.NewService(testConfig())
	pair, err := svc.IssueSession(uuid.NewString(), viewer.AccessLevelOpen)
	require.NoError(t, err)

	// Flip the last char — signature mismatch.
	tampered := pair.AccessToken[:len(pair.AccessToken)-1] + "X"
	if tampered == pair.AccessToken {
		tampered = pair.AccessToken[:len(pair.AccessToken)-1] + "Y"
	}
	_, err = svc.Parse(tampered)
	assert.Error(t, err)
}

func TestParse_RejectsExpiredToken(t *testing.T) {
	cfg := testConfig()
	cfg.SlidingTTL = 1 * time.Millisecond
	svc := viewer.NewService(cfg)

	pair, err := svc.IssueSession(uuid.NewString(), viewer.AccessLevelOpen)
	require.NoError(t, err)
	time.Sleep(10 * time.Millisecond)
	_, err = svc.Parse(pair.AccessToken)
	assert.Error(t, err, "expired token must be rejected")
}

func TestParse_RejectsWrongSigningKey(t *testing.T) {
	svc1 := viewer.NewService(testConfig())
	pair, err := svc1.IssueSession(uuid.NewString(), viewer.AccessLevelPIN)
	require.NoError(t, err)

	cfg2 := testConfig()
	cfg2.SigningKey = []byte("different-key-absolutely-not-same!")
	svc2 := viewer.NewService(cfg2)

	_, err = svc2.Parse(pair.AccessToken)
	assert.Error(t, err, "token signed with different key must not verify")
}

func TestParse_RejectsRefreshTokenAsAccessToken(t *testing.T) {
	svc := viewer.NewService(testConfig())
	pair, err := svc.IssueSession(uuid.NewString(), viewer.AccessLevelPIN)
	require.NoError(t, err)

	_, err = svc.Parse(pair.RefreshToken)
	assert.Error(t, err, "refresh tokens must not authorize viewer access routes")
}

func TestParse_EmptyTokenReturnsError(t *testing.T) {
	svc := viewer.NewService(testConfig())
	_, err := svc.Parse("")
	assert.Error(t, err)
}

func TestIssueSession_BoundsAccessLevel(t *testing.T) {
	svc := viewer.NewService(testConfig())
	// Invalid access level must be rejected.
	_, err := svc.IssueSession(uuid.NewString(), "not-a-real-level")
	assert.Error(t, err)
}

func TestClaims_StreamIDMatchGuard(t *testing.T) {
	svc := viewer.NewService(testConfig())
	s1 := uuid.NewString()
	s2 := uuid.NewString()
	pair, err := svc.IssueSession(s1, viewer.AccessLevelPIN)
	require.NoError(t, err)
	claims, err := svc.Parse(pair.AccessToken)
	require.NoError(t, err)
	assert.Equal(t, s1, claims.StreamID)
	assert.NotEqual(t, s2, claims.StreamID, "claims must bind to the stream they were issued for")
}
