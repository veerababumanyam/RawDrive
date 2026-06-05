package service

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/repository"
)

// fakeShareLinkStore is an in-memory shareLinkStore for unit tests. It lets a
// test force GetByToken to return either a genuine not-found ((nil, nil), as the
// repo collapses pgx.ErrNoRows) or a real DB error, so the service's
// transient-vs-genuine distinction (issue #179) can be asserted without a DB.
type fakeShareLinkStore struct {
	link   *repository.ShareLink
	getErr error
}

func (f *fakeShareLinkStore) Create(context.Context, *repository.ShareLink) error { return nil }
func (f *fakeShareLinkStore) GetByToken(context.Context, string) (*repository.ShareLink, error) {
	return f.link, f.getErr
}
func (f *fakeShareLinkStore) ListByGallery(context.Context, uuid.UUID) ([]repository.ShareLink, error) {
	return nil, nil
}
func (f *fakeShareLinkStore) Revoke(context.Context, uuid.UUID) error { return nil }
func (f *fakeShareLinkStore) RevokeInWorkspace(context.Context, uuid.UUID, uuid.UUID) (int64, error) {
	return 0, nil
}
func (f *fakeShareLinkStore) IncrementViewCount(context.Context, string) error { return nil }
func (f *fakeShareLinkStore) IncrementAccessCount(context.Context, string) (int, error) {
	return 0, nil
}
func (f *fakeShareLinkStore) IncrementDownloadCount(context.Context, string) error { return nil }

// TestGalleryIDForToken_TransientDBErrorIsRetryable proves a real DB error from
// GetByToken is surfaced as ErrShareLinkUnavailable (transient), NOT collapsed
// into a permanent "share link not found". Fails on the pre-fix code, which
// returned a plain "share link not found" for any error. (Issue #179.)
func TestGalleryIDForToken_TransientDBErrorIsRetryable(t *testing.T) {
	dbErr := errors.New("share link get: connection reset by peer")
	svc := &ShareLinkService{repo: &fakeShareLinkStore{getErr: dbErr}}

	_, err := svc.GalleryIDForToken(context.Background(), "tok")
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrShareLinkUnavailable),
		"a DB error must be transient (ErrShareLinkUnavailable), got %v", err)
}

// TestGalleryIDForToken_GenuineNotFoundIsPermanent proves an unknown token
// (repo returns (nil, nil)) stays a permanent "not found" denial — NOT
// transient — so genuine 404s are never softened to a retryable 503.
func TestGalleryIDForToken_GenuineNotFoundIsPermanent(t *testing.T) {
	svc := &ShareLinkService{repo: &fakeShareLinkStore{link: nil, getErr: nil}}

	_, err := svc.GalleryIDForToken(context.Background(), "tok")
	require.Error(t, err)
	assert.False(t, errors.Is(err, ErrShareLinkUnavailable),
		"a genuine not-found must NOT be transient, got %v", err)
	assert.Contains(t, err.Error(), "share link not found")
}

// TestValidateAccess_TransientDBErrorIsRetryable proves the same distinction on
// the authoritative access gate: a DB error → transient ErrShareLinkUnavailable,
// fail-closed (granted=false). Fails on the pre-fix code (plain "not found").
func TestValidateAccess_TransientDBErrorIsRetryable(t *testing.T) {
	dbErr := errors.New("share link get: server closed the connection unexpectedly")
	svc := &ShareLinkService{repo: &fakeShareLinkStore{getErr: dbErr}}

	ok, err := svc.ValidateAccess(context.Background(), "tok", "")
	assert.False(t, ok, "a transient failure must fail closed (deny)")
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrShareLinkUnavailable),
		"a DB error must be transient (ErrShareLinkUnavailable), got %v", err)
}

// TestValidateAccess_GenuineNotFoundIsPermanent proves an unknown token stays a
// permanent denial (not transient) on ValidateAccess.
func TestValidateAccess_GenuineNotFoundIsPermanent(t *testing.T) {
	svc := &ShareLinkService{repo: &fakeShareLinkStore{link: nil, getErr: nil}}

	ok, err := svc.ValidateAccess(context.Background(), "tok", "")
	assert.False(t, ok)
	require.Error(t, err)
	assert.False(t, errors.Is(err, ErrShareLinkUnavailable),
		"a genuine not-found must NOT be transient, got %v", err)
	assert.Contains(t, err.Error(), "share link not found")
}

func TestNormalizeShareAccessMode_DefaultsAndRejectsUnsupportedModes(t *testing.T) {
	mode, err := NormalizeShareAccessMode("", false)
	require.NoError(t, err)
	assert.Equal(t, AccessPublic, mode)

	mode, err = NormalizeShareAccessMode("", true)
	require.NoError(t, err)
	assert.Equal(t, AccessPIN, mode)

	mode, err = NormalizeShareAccessMode(" EMAIL ", false)
	require.NoError(t, err)
	assert.Equal(t, AccessEmail, mode)

	_, err = NormalizeShareAccessMode("anyone-with-a-secret-spreadsheet", false)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported share link access_mode")
}

func TestShareEmailCredentialAllowed_SupportsJSONAndNativeStringSlices(t *testing.T) {
	assert.True(t, shareEmailCredentialAllowed(map[string]interface{}{
		"allowed_emails": []interface{}{"Client@Example.com", "family@example.com"},
	}, " client@example.com "))

	assert.True(t, shareEmailCredentialAllowed(map[string]interface{}{
		"allowed_emails": []string{"family@example.com"},
	}, "FAMILY@example.com"))

	assert.False(t, shareEmailCredentialAllowed(map[string]interface{}{
		"allowed_emails": []interface{}{"family@example.com"},
	}, "other@example.com"))

	assert.False(t, shareEmailCredentialAllowed(map[string]interface{}{}, "client@example.com"))
}
