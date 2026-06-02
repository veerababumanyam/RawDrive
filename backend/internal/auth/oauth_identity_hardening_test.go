package auth_test

import (
	"context"
	"errors"
	"testing"

	"github.com/rawdrive/backend/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Cluster F — OAuth identity hardening regression suite.
//
// Covers the four confirmed findings:
//   - S1-G1 / AREA-AUTH-4: an UNVERIFIED local account is NOT taken over via
//     Google auto-link; a Google profile with email_verified==false is rejected.
//   - S1-G2 / AREA-AUTH-3: identity resolves by (provider, provider_subject)
//     first, so the stable Google "sub" (not the mutable email) decides login.
//   - S1-G3 / AREA-AUTH-2: state is single-use within its TTL via the browser
//     cookie nonce — a replayed/mismatched nonce is rejected.

// TestOAuthHardening_UnverifiedLocalAccountNotTakenOver is the core S1-G1 guard.
// An attacker pre-registers the victim's email locally but never activates it
// (email_verified=false). The victim later signs in with Google using that same
// email. The callback must REFUSE to auto-link onto the unverified local
// account rather than handing the attacker's row a verified Google session.
func TestOAuthHardening_UnverifiedLocalAccountNotTakenOver(t *testing.T) {
	profile := &auth.OAuthProfile{
		Email:       "victim@gmail.com",
		DisplayName: "Victim",
		ProviderID:  "google-sub-victim",
	}
	provider := newMockProvider(profile) // sets EmailVerified=true on the Google side
	store := &mockUserStore{users: map[string]*auth.User{
		// Attacker-controlled, never-activated local row for the victim's email.
		"victim@gmail.com": {ID: "attacker-uuid", Email: "victim@gmail.com", EmailVerified: false},
	}}
	svc, state, nonce := newAuthorizedService(t, provider, store)

	user, _, err := svc.HandleGoogleCallback(context.Background(), "valid-code", state, nonce)
	require.Error(t, err, "must refuse to link Google onto an unverified local account")
	assert.Nil(t, user, "no session may be issued for the takeover attempt")
	var oauthErr *auth.OAuthCallbackError
	require.True(t, errors.As(err, &oauthErr), "expected OAuthCallbackError")
	assert.Equal(t, auth.OAuthErrAccountNotActivated, oauthErr.Code)
}

// TestOAuthHardening_VerifiedLocalAccountStillLinks is the negative control for
// S1-G1: a legitimately verified local account is still auto-linked and logged
// in, so the fix does not over-block real users.
func TestOAuthHardening_VerifiedLocalAccountStillLinks(t *testing.T) {
	profile := &auth.OAuthProfile{
		Email:       "real@gmail.com",
		DisplayName: "Real User",
		ProviderID:  "google-sub-real",
	}
	provider := newMockProvider(profile)
	store := &mockUserStore{users: map[string]*auth.User{
		"real@gmail.com": {ID: "real-uuid", Email: "real@gmail.com", EmailVerified: true},
	}}
	svc, state, nonce := newAuthorizedService(t, provider, store)

	user, _, err := svc.HandleGoogleCallback(context.Background(), "valid-code", state, nonce)
	require.NoError(t, err)
	require.NotNil(t, user)
	assert.Equal(t, "real-uuid", user.ID)
}

// TestOAuthHardening_GoogleEmailVerifiedFalseRejected is the S1-G1/AREA-AUTH-4
// guard for the Google side: even with NO local account present, a Google
// profile whose email_verified is false must be rejected outright (it must
// never create an account either).
func TestOAuthHardening_GoogleEmailVerifiedFalseRejected(t *testing.T) {
	// Build the provider manually so EmailVerified stays false (newMockProvider
	// would force it true).
	provider := &mockOAuthProvider{
		exchangeFunc: func(code, codeVerifier string) (*auth.OAuthToken, error) {
			return &auth.OAuthToken{AccessToken: "tok"}, nil
		},
		profileFunc: func(token *auth.OAuthToken, expectedNonce string) (*auth.OAuthProfile, error) {
			return &auth.OAuthProfile{
				Email:         "unverified@gmail.com",
				DisplayName:   "Unverified",
				ProviderID:    "google-sub-unverified",
				EmailVerified: false,
			}, nil
		},
	}
	store := &mockUserStore{users: map[string]*auth.User{}}
	svc, state, nonce := newAuthorizedService(t, provider, store)

	user, _, err := svc.HandleGoogleCallback(context.Background(), "valid-code", state, nonce)
	require.Error(t, err, "an unverified Google email must be rejected")
	assert.Nil(t, user)
	assert.Empty(t, store.users["unverified@gmail.com"], "no account may be created from an unverified Google identity")
}

// TestOAuthHardening_ResolvesByProviderSubjectFirst is the S1-G2/AREA-AUTH-3
// guard. A Google identity is already linked to account A. Google then reports
// a DIFFERENT email for that same stable subject (e.g. the user changed their
// Google email, or an attacker controls a row at the new email). Resolution by
// provider_subject must still return account A — the email must not re-point
// the identity.
func TestOAuthHardening_ResolvesByProviderSubjectFirst(t *testing.T) {
	const sub = "google-sub-stable"
	store := &mockUserStore{
		users: map[string]*auth.User{
			"original@gmail.com": {ID: "account-A", Email: "original@gmail.com", EmailVerified: true},
			// A different, attacker-controlled row at the new email.
			"changed@gmail.com": {ID: "account-B", Email: "changed@gmail.com", EmailVerified: true},
		},
		links: map[string]string{linkKey("google", sub): "account-A"},
	}
	// Google now reports the changed email but the SAME subject.
	profile := &auth.OAuthProfile{
		Email:       "changed@gmail.com",
		DisplayName: "Stable",
		ProviderID:  sub,
	}
	provider := newMockProvider(profile)
	svc, state, nonce := newAuthorizedService(t, provider, store)

	user, _, err := svc.HandleGoogleCallback(context.Background(), "valid-code", state, nonce)
	require.NoError(t, err)
	require.NotNil(t, user)
	assert.Equal(t, "account-A", user.ID, "must resolve by provider_subject, not by the (changed) email")
}

// TestOAuthHardening_StateNonceMismatchRejected is the S1-G3/AREA-AUTH-2 guard.
// A valid signed state replayed with the WRONG cookie nonce (e.g. from a
// different browser, or a forged state with no matching cookie) must be
// rejected.
func TestOAuthHardening_StateNonceMismatchRejected(t *testing.T) {
	profile := &auth.OAuthProfile{
		Email:       "user@gmail.com",
		DisplayName: "User",
		ProviderID:  "google-sub-1",
	}
	provider := newMockProvider(profile)
	store := &mockUserStore{users: map[string]*auth.User{}}
	svc, state, nonce := newAuthorizedService(t, provider, store)

	// Wrong nonce (attacker does not hold the victim's oauth_state cookie).
	user, _, err := svc.HandleGoogleCallback(context.Background(), "valid-code", state, "not-the-nonce")
	require.Error(t, err, "a mismatched state nonce must be rejected")
	assert.Nil(t, user)
	var oauthErr *auth.OAuthCallbackError
	require.True(t, errors.As(err, &oauthErr), "expected OAuthCallbackError")
	assert.Equal(t, auth.OAuthErrStateInvalid, oauthErr.Code)

	// Empty nonce (no cookie presented at all) must also be rejected.
	user, _, err = svc.HandleGoogleCallback(context.Background(), "valid-code", state, "")
	require.Error(t, err, "a missing state nonce must be rejected")
	assert.Nil(t, user)
	oauthErr = nil
	require.True(t, errors.As(err, &oauthErr), "expected OAuthCallbackError")
	assert.Equal(t, auth.OAuthErrStateInvalid, oauthErr.Code)

	// Sanity: the correct nonce still works (nonce was not consumed by the
	// failed attempts above — the signed state is stateless).
	user, _, err = svc.HandleGoogleCallback(context.Background(), "valid-code", state, nonce)
	require.NoError(t, err)
	require.NotNil(t, user)
}
