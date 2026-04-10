package service

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─────────────────────────────────────────────────────────────────────────────
// M16 E50-S2 — Upload allowlist token service tests.
//
// Covers FR-UPS-040..042 (FP override token issue/consume). Uses an
// in-memory repo stub so the tests stay pure unit and do not need Docker.
//
// Round 3 RED → GREEN transition:
//   TestIssue_StoresToken_WithExpiry       → verifies Issue persists a new row
//   TestConsume_ValidToken_Succeeds        → happy path single-use
//   TestConsume_UnknownToken_ReturnsErr    → bad token rejected
//   TestConsume_ExpiredToken_ReturnsErr    → expired token rejected
//   TestConsume_AlreadyUsedToken_Rejected  → single-use semantics enforced
//   TestConsume_ManifestMismatch_Rejected  → token bound to a specific manifest hash
// ─────────────────────────────────────────────────────────────────────────────

// inMemoryAllowlistRepo is a thread-safe in-memory implementation of
// UploadAllowlistRepo for unit tests. It stores tokens by the same byte key
// the production repo would use.
type inMemoryAllowlistRepo struct {
	mu     sync.Mutex
	tokens map[string]UploadAllowlistToken
}

func newInMemoryAllowlistRepo() *inMemoryAllowlistRepo {
	return &inMemoryAllowlistRepo{tokens: make(map[string]UploadAllowlistToken)}
}

func (r *inMemoryAllowlistRepo) Store(_ context.Context, token UploadAllowlistToken) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.tokens[string(token.Token)] = token
	return nil
}

func (r *inMemoryAllowlistRepo) FindByToken(_ context.Context, raw []byte) (*UploadAllowlistToken, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	t, ok := r.tokens[string(raw)]
	if !ok {
		return nil, nil
	}
	return &t, nil
}

func (r *inMemoryAllowlistRepo) MarkUsed(_ context.Context, raw []byte, usedAt time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	t, ok := r.tokens[string(raw)]
	if !ok {
		return errors.New("token not found")
	}
	t.UsedAt = &usedAt
	r.tokens[string(raw)] = t
	return nil
}

func newTestAllowlistService() (*UploadAllowlistService, *inMemoryAllowlistRepo) {
	repo := newInMemoryAllowlistRepo()
	svc := NewUploadAllowlistService(repo)
	return svc, repo
}

func TestIssue_StoresToken_WithExpiry(t *testing.T) {
	svc, repo := newTestAllowlistService()

	wsID := uuid.New()
	actorID := uuid.New()

	token, err := svc.Issue(context.Background(), IssueAllowlistInput{
		ManifestHash:  "abc123",
		WorkspaceID:   wsID,
		IssuedBy:      actorID,
		Justification: "legitimate original scan",
		TTL:           24 * time.Hour,
	})
	require.NoError(t, err)
	require.NotEmpty(t, token)

	// The stored row must have the matching fields and a future expiry.
	stored, err := repo.FindByToken(context.Background(), token)
	require.NoError(t, err)
	require.NotNil(t, stored)
	assert.Equal(t, "abc123", stored.ManifestHash)
	assert.Equal(t, wsID, stored.WorkspaceID)
	assert.Equal(t, actorID, stored.IssuedBy)
	assert.Equal(t, "legitimate original scan", stored.Justification)
	assert.True(t, stored.ExpiresAt.After(time.Now()),
		"expires_at should be in the future; got %v", stored.ExpiresAt)
	assert.Nil(t, stored.UsedAt, "newly issued token should not be used yet")
}

func TestConsume_ValidToken_Succeeds(t *testing.T) {
	svc, _ := newTestAllowlistService()

	token, err := svc.Issue(context.Background(), IssueAllowlistInput{
		ManifestHash:  "hash-ok",
		WorkspaceID:   uuid.New(),
		IssuedBy:      uuid.New(),
		Justification: "ok",
		TTL:           time.Hour,
	})
	require.NoError(t, err)

	err = svc.Consume(context.Background(), token, "hash-ok")
	assert.NoError(t, err, "valid unused token should be consumable")
}

func TestConsume_UnknownToken_ReturnsErr(t *testing.T) {
	svc, _ := newTestAllowlistService()
	err := svc.Consume(context.Background(), []byte("not-a-real-token-bytes"), "anything")
	assert.ErrorIs(t, err, ErrAllowlistTokenNotFound)
}

func TestConsume_ExpiredToken_ReturnsErr(t *testing.T) {
	svc, repo := newTestAllowlistService()

	token, err := svc.Issue(context.Background(), IssueAllowlistInput{
		ManifestHash:  "hash-exp",
		WorkspaceID:   uuid.New(),
		IssuedBy:      uuid.New(),
		Justification: "test",
		TTL:           time.Hour,
	})
	require.NoError(t, err)

	// Manually rewind the stored expiry to simulate expiration.
	stored, _ := repo.FindByToken(context.Background(), token)
	stored.ExpiresAt = time.Now().Add(-1 * time.Minute)
	_ = repo.Store(context.Background(), *stored)

	err = svc.Consume(context.Background(), token, "hash-exp")
	assert.ErrorIs(t, err, ErrAllowlistTokenExpired)
}

func TestConsume_AlreadyUsedToken_Rejected(t *testing.T) {
	svc, _ := newTestAllowlistService()

	token, err := svc.Issue(context.Background(), IssueAllowlistInput{
		ManifestHash:  "hash-used",
		WorkspaceID:   uuid.New(),
		IssuedBy:      uuid.New(),
		Justification: "test",
		TTL:           time.Hour,
	})
	require.NoError(t, err)

	require.NoError(t, svc.Consume(context.Background(), token, "hash-used"))

	// Second consume must reject.
	err = svc.Consume(context.Background(), token, "hash-used")
	assert.ErrorIs(t, err, ErrAllowlistTokenAlreadyUsed)
}

func TestConsume_ManifestMismatch_Rejected(t *testing.T) {
	svc, _ := newTestAllowlistService()

	token, err := svc.Issue(context.Background(), IssueAllowlistInput{
		ManifestHash:  "expected-hash",
		WorkspaceID:   uuid.New(),
		IssuedBy:      uuid.New(),
		Justification: "test",
		TTL:           time.Hour,
	})
	require.NoError(t, err)

	err = svc.Consume(context.Background(), token, "wrong-hash")
	assert.ErrorIs(t, err, ErrAllowlistManifestMismatch,
		"token bound to manifest A must not redeem for manifest B")
}
