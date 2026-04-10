package auth_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/auth"
)

// Tests for F-006 Part A (audit 2026-04-10): the JWT signing key must
// survive service restarts. Before this fix NewJWTService generated a
// fresh RSA key at boot, so every restart invalidated every access token.
//
// These tests exercise auth.LoadPersistedSigningKey against an in-memory
// fake JWTKeyStore so they do not need a real DB. The round-trip test
// explicitly simulates a "restart" by constructing two separate
// JWTService instances against the same store — the second one must be
// able to parse tokens the first one signed, which is only possible if
// the key was loaded from the store and not regenerated.

// fakeJWTKeyStore is an in-memory JWTKeyStore. Captures failures so
// individual tests can assert on observed behavior.
type fakeJWTKeyStore struct {
	pem      string
	getError error
	putError error
	getCalls int
	putCalls int
}

func (f *fakeJWTKeyStore) GetSigningKeyPEM(ctx context.Context) (string, error) {
	f.getCalls++
	return f.pem, f.getError
}

func (f *fakeJWTKeyStore) PutSigningKeyPEM(ctx context.Context, pemStr string) error {
	f.putCalls++
	if f.putError != nil {
		return f.putError
	}
	f.pem = pemStr
	return nil
}

func newPersistenceTestJWTService() auth.JWTService {
	return auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
		MaxSessions:        5,
	})
}

// genericTokenClaims returns a minimal valid TokenClaims fixture for
// token round-trip tests. All required fields present.
func genericTokenClaims() auth.TokenClaims {
	return auth.TokenClaims{
		Sub:          "user-1",
		WorkspaceID:  "ws-1",
		Role:         "Owner",
		PlatformRole: "photographer",
		StateID:      "state-1",
	}
}

func TestLoadPersistedSigningKey_FirstBoot_GeneratesAndPersists(t *testing.T) {
	svc := newPersistenceTestJWTService()
	store := &fakeJWTKeyStore{}

	err := auth.LoadPersistedSigningKey(context.Background(), svc, store)
	require.NoError(t, err)

	assert.Equal(t, 1, store.getCalls, "should have tried to read the key first")
	assert.Equal(t, 1, store.putCalls, "should have persisted the newly generated key")
	assert.NotEmpty(t, store.pem, "persisted PEM must not be empty")
	assert.Contains(t, store.pem, "-----BEGIN PRIVATE KEY-----",
		"persisted PEM must be PKCS8-wrapped")
	assert.Contains(t, store.pem, "-----END PRIVATE KEY-----")
}

func TestLoadPersistedSigningKey_SubsequentBoot_ReadsKey(t *testing.T) {
	// First boot — seeds the store.
	svc1 := newPersistenceTestJWTService()
	store := &fakeJWTKeyStore{}
	require.NoError(t, auth.LoadPersistedSigningKey(context.Background(), svc1, store))
	assert.Equal(t, 1, store.putCalls, "first boot persists the key")

	// Second boot — should read the existing key, NOT generate a new one.
	svc2 := newPersistenceTestJWTService()
	require.NoError(t, auth.LoadPersistedSigningKey(context.Background(), svc2, store))
	assert.Equal(t, 1, store.putCalls,
		"second boot must not persist a new key — the existing one should be reused")
	assert.Equal(t, 2, store.getCalls, "second boot must read from the store")
}

func TestLoadPersistedSigningKey_TokensSurviveRestart(t *testing.T) {
	// The whole point of F-006 Part A: a token signed before a "restart"
	// must still validate after the restart. This test simulates the
	// restart by constructing two JWTService instances against the same
	// store — the second one has a different ephemeral key internally
	// until LoadPersistedSigningKey swaps it for the persisted one.
	ctx := context.Background()
	store := &fakeJWTKeyStore{}

	svc1 := newPersistenceTestJWTService()
	require.NoError(t, auth.LoadPersistedSigningKey(ctx, svc1, store))

	// Sign a token under svc1.
	token, err := svc1.GenerateAccessToken(ctx, genericTokenClaims())
	require.NoError(t, err)
	require.NotEmpty(t, token)

	// "Restart" — new service instance, same store.
	svc2 := newPersistenceTestJWTService()
	require.NoError(t, auth.LoadPersistedSigningKey(ctx, svc2, store))

	// svc2 must be able to parse the token signed by svc1.
	claims, err := svc2.ParseAccessToken(ctx, token)
	require.NoError(t, err, "token signed before restart must still validate after restart")
	assert.Equal(t, "user-1", claims.Sub)
	assert.Equal(t, "ws-1", claims.WorkspaceID)
}

func TestLoadPersistedSigningKey_StoreGetError_NoFallback(t *testing.T) {
	// If the store returns a real error (not empty+nil), we must NOT
	// silently generate a new key — that would mask a DB outage and
	// invalidate all tokens the moment the DB blips.
	svc := newPersistenceTestJWTService()
	store := &fakeJWTKeyStore{getError: errors.New("db connection refused")}

	err := auth.LoadPersistedSigningKey(context.Background(), svc, store)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "load persisted key")
	assert.Equal(t, 0, store.putCalls, "must not persist a new key when the read failed")
}

func TestLoadPersistedSigningKey_StorePutError_Propagates(t *testing.T) {
	// First boot but the persist step fails. We must propagate the error
	// rather than silently continuing — the caller needs to know that
	// tokens signed in this run will be lost on restart.
	svc := newPersistenceTestJWTService()
	store := &fakeJWTKeyStore{putError: errors.New("db write failed")}

	err := auth.LoadPersistedSigningKey(context.Background(), svc, store)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "persist signing key")
}

func TestLoadPersistedSigningKey_MalformedPEM_Rejected(t *testing.T) {
	svc := newPersistenceTestJWTService()
	store := &fakeJWTKeyStore{pem: "this is not a PEM block"}

	err := auth.LoadPersistedSigningKey(context.Background(), svc, store)
	require.Error(t, err, "malformed PEM must be rejected")
	assert.Contains(t, err.Error(), "decode persisted key")
}

func TestLoadPersistedSigningKey_NilStore_Rejected(t *testing.T) {
	svc := newPersistenceTestJWTService()
	err := auth.LoadPersistedSigningKey(context.Background(), svc, nil)
	require.Error(t, err, "nil store must be rejected at the entry point")
}
