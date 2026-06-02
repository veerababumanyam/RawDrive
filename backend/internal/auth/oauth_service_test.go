package auth_test

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"testing"

	"github.com/rawdrive/backend/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockOAuthProvider simulates a Google OAuth provider for testing.
type mockOAuthProvider struct {
	exchangeFunc func(code, codeVerifier string) (*auth.OAuthToken, error)
	profileFunc  func(token *auth.OAuthToken, expectedNonce string) (*auth.OAuthProfile, error)
}

func (m *mockOAuthProvider) ExchangeCode(ctx context.Context, code, codeVerifier string) (*auth.OAuthToken, error) {
	return m.exchangeFunc(code, codeVerifier)
}

func (m *mockOAuthProvider) GetProfile(ctx context.Context, token *auth.OAuthToken, expectedNonce string) (*auth.OAuthProfile, error) {
	return m.profileFunc(token, expectedNonce)
}

// mockUserStore simulates user persistence for OAuth tests.
//
// It keeps two identity indexes so it can back both resolution paths the
// merged auth.UserStore exposes:
//
//   - oauthLinks ("provider:subject" -> userID) backs FindByOAuth and HEAD's
//     application-layer account-takeover detection in LinkOAuth.
//   - links ("provider|subject" -> userID, via linkKey) backs
//     FindByProviderSubject, the PRIMARY identity resolution (S1-G2 /
//     AREA-AUTH-3): the stable Google "sub" decides who logs in, not the
//     mutable email.
//
// Both indexes are written together in LinkOAuth so the two resolution paths
// never disagree.
type mockUserStore struct {
	users      map[string]*auth.User
	oauthLinks map[string]string
	// links maps "provider|subject" -> userID so FindByProviderSubject can
	// resolve a previously-linked identity, mirroring user_auth_methods.
	links       map[string]string
	linkErr     error
	backfillErr error
}

func linkKey(provider, subject string) string { return provider + "|" + subject }

func (m *mockUserStore) FindByOAuth(ctx context.Context, provider, providerID string) (*auth.User, error) {
	if m.oauthLinks == nil {
		return nil, nil
	}
	userID, ok := m.oauthLinks[provider+":"+providerID]
	if !ok {
		return nil, nil
	}
	for _, u := range m.users {
		if u.ID == userID {
			return u, nil
		}
	}
	return nil, nil
}

func (m *mockUserStore) FindByEmail(ctx context.Context, email string) (*auth.User, error) {
	if u, ok := m.users[email]; ok {
		return u, nil
	}
	return nil, nil
}

func (m *mockUserStore) FindByProviderSubject(ctx context.Context, provider, providerSubject string) (*auth.User, error) {
	if m.links == nil {
		return nil, nil
	}
	userID, ok := m.links[linkKey(provider, providerSubject)]
	if !ok {
		return nil, nil
	}
	for _, u := range m.users {
		if u.ID == userID {
			return u, nil
		}
	}
	return nil, nil
}

func (m *mockUserStore) MarkEmailVerified(ctx context.Context, userID string) error {
	for _, u := range m.users {
		if u.ID == userID {
			u.EmailVerified = true
		}
	}
	return nil
}

func (m *mockUserStore) Create(ctx context.Context, u *auth.User) (*auth.User, error) {
	m.users[u.Email] = u
	return u, nil
}

func (m *mockUserStore) BackfillProfile(_ context.Context, userID, displayName, avatarURL string) error {
	if m.backfillErr != nil {
		return m.backfillErr
	}
	var target *auth.User
	if u, ok := m.users[userID]; ok {
		target = u
	} else {
		for _, u := range m.users {
			if u.ID == userID {
				target = u
				break
			}
		}
	}
	if target != nil {
		if displayName != "" {
			target.DisplayName = displayName
		}
		if avatarURL != "" {
			target.AvatarURL = avatarURL
		}
	}
	return nil
}

func (m *mockUserStore) LinkOAuth(ctx context.Context, userID, provider, providerID string) error {
	if m.linkErr != nil {
		return m.linkErr
	}
	// Application-layer takeover detection (HEAD): a subject already linked to
	// a DIFFERENT account is rejected, mirroring the production store returning
	// auth.ErrOAuthAccountConflict on a UNIQUE (provider, provider_subject)
	// violation owned by another user.
	if m.oauthLinks == nil {
		m.oauthLinks = map[string]string{}
	}
	if m.links == nil {
		m.links = map[string]string{}
	}
	oauthKey := provider + ":" + providerID
	if existingUserID, ok := m.oauthLinks[oauthKey]; ok && existingUserID != userID {
		return auth.ErrOAuthGoogleLinkConflict
	}
	if existingUserID, ok := m.links[linkKey(provider, providerID)]; ok && existingUserID != userID {
		return auth.ErrOAuthGoogleLinkConflict
	}
	for existingKey, existingUserID := range m.links {
		if existingUserID == userID &&
			strings.HasPrefix(existingKey, provider+"|") &&
			existingKey != linkKey(provider, providerID) {
			return auth.ErrOAuthRawDriveLinkConflict
		}
	}
	// Write both indexes so FindByOAuth and FindByProviderSubject stay in sync.
	m.oauthLinks[oauthKey] = userID
	m.links[linkKey(provider, providerID)] = userID
	return nil
}

func newMockProvider(profile *auth.OAuthProfile) *mockOAuthProvider {
	// Default Google profiles to a verified email so existing happy-path tests
	// keep passing; the unverified-email rejection tests construct their own
	// profile with EmailVerified=false explicitly.
	if profile != nil {
		profile.EmailVerified = true
	}
	return &mockOAuthProvider{
		exchangeFunc: func(code, codeVerifier string) (*auth.OAuthToken, error) {
			return &auth.OAuthToken{AccessToken: "mock-access-token", IDToken: "mock-id-token"}, nil
		},
		profileFunc: func(token *auth.OAuthToken, expectedNonce string) (*auth.OAuthProfile, error) {
			return profile, nil
		},
	}
}

// newAuthorizedService starts an OAuth flow and returns the service plus the
// state and the signed oauth_state cookie value the callback must be given (it
// would normally arrive via the HttpOnly oauth_state cookie and binds the
// per-request nonce). ClientSecret is set so the signed-state + nonce-binding
// path is exercised. The third return value is what HandleGoogleCallback
// expects as its cookieValue argument.
func newAuthorizedService(t *testing.T, provider auth.OAuthProvider, store auth.UserStore) (svc *auth.OAuthService, state string, cookieValue string) {
	t.Helper()

	svc = auth.NewOAuthService(
		auth.OAuthConfig{ClientID: "test-client-id", ClientSecret: "test-client-secret", RedirectURI: "http://localhost/callback"},
		provider,
		store,
	)
	start, err := svc.InitiateGoogleAuth(context.Background(), "http://localhost:3000")
	require.NoError(t, err)

	parsed, err := url.Parse(start.RedirectURL)
	require.NoError(t, err)

	return svc, parsed.Query().Get("state"), start.CookieValue
}

func TestGoogleOAuth_InitiateFlow(t *testing.T) {
	provider := newMockProvider(nil)
	svc := auth.NewOAuthService(auth.OAuthConfig{ClientID: "test-client-id", ClientSecret: "test-client-secret", RedirectURI: "http://localhost/callback"}, provider, &mockUserStore{users: map[string]*auth.User{}})
	ctx := context.Background()

	start, err := svc.InitiateGoogleAuth(ctx, "http://localhost:3000")
	require.NoError(t, err)
	assert.NotEmpty(t, start.RedirectURL)
	assert.NotEmpty(t, start.CookieValue, "should return a signed oauth_state cookie value")
	assert.Contains(t, start.RedirectURL, "client_id=test-client-id", "should include client_id")
	assert.Contains(t, start.RedirectURL, "state=", "should include state parameter")
	assert.Contains(t, start.RedirectURL, "code_challenge=", "should include PKCE code challenge")
	assert.Contains(t, start.RedirectURL, "code_challenge_method=S256", "should use S256 PKCE")
	assert.NotContains(t, start.RedirectURL, "code_verifier", "should never leak PKCE verifier")
}

func TestGoogleOAuth_HandleCallback(t *testing.T) {
	profile := &auth.OAuthProfile{
		Email:         "user@gmail.com",
		EmailVerified: true,
		DisplayName:   "Test User",
		AvatarURL:     "https://example.com/avatar.jpg",
		ProviderID:    "google-id-123",
	}
	provider := newMockProvider(profile)
	store := &mockUserStore{users: map[string]*auth.User{}}
	svc, state, cookieValue := newAuthorizedService(t, provider, store)

	user, returnTo, err := svc.HandleGoogleCallback(context.Background(), "valid-code", state, cookieValue)
	require.NoError(t, err)
	require.NotNil(t, user)
	assert.Equal(t, "user@gmail.com", user.Email)
	assert.Equal(t, "http://localhost:3000", returnTo)
}

func TestGoogleOAuth_StateSurvivesBackendInstanceSwitch(t *testing.T) {
	profile := &auth.OAuthProfile{
		Email:         "multi-node@gmail.com",
		EmailVerified: true,
		DisplayName:   "Multi Node",
		ProviderID:    "google-id-multi-node",
	}
	config := auth.OAuthConfig{
		ClientID:     "test-client-id",
		ClientSecret: "test-client-secret",
		RedirectURI:  "http://localhost/callback",
	}
	store := &mockUserStore{users: map[string]*auth.User{}}
	firstInstance := auth.NewOAuthService(config, newMockProvider(profile), store)
	start, err := firstInstance.InitiateGoogleAuth(context.Background(), "https://rawdrive.in")
	require.NoError(t, err)

	parsed, err := url.Parse(start.RedirectURL)
	require.NoError(t, err)

	// The signed state survives an instance switch; the nonce travels with the
	// browser's oauth_state cookie, so the second instance still validates it.
	secondInstance := auth.NewOAuthService(config, newMockProvider(profile), store)
	user, returnTo, err := secondInstance.HandleGoogleCallback(context.Background(), "valid-code", parsed.Query().Get("state"), start.CookieValue)
	require.NoError(t, err)
	require.NotNil(t, user)
	assert.Equal(t, "https://rawdrive.in", returnTo)
	assert.Equal(t, "multi-node@gmail.com", user.Email)
}

func TestGoogleOAuth_NewUser(t *testing.T) {
	profile := &auth.OAuthProfile{
		Email:         "newuser@gmail.com",
		EmailVerified: true,
		DisplayName:   "New User",
		AvatarURL:     "https://example.com/avatar.jpg",
		ProviderID:    "google-id-new",
	}
	provider := newMockProvider(profile)
	store := &mockUserStore{users: map[string]*auth.User{}}
	svc, state, cookieValue := newAuthorizedService(t, provider, store)

	user, _, err := svc.HandleGoogleCallback(context.Background(), "valid-code", state, cookieValue)
	require.NoError(t, err)
	require.NotNil(t, user)
	assert.Equal(t, "newuser@gmail.com", user.Email)
	assert.NotEmpty(t, user.ID, "new user should have an assigned ID")
	assert.True(t, user.EmailVerified, "Google-created account must be born email-verified")
}

func TestGoogleOAuth_ExistingUser(t *testing.T) {
	profile := &auth.OAuthProfile{
		Email:         "existing@gmail.com",
		EmailVerified: true,
		DisplayName:   "Existing User",
		ProviderID:    "google-id-existing",
	}
	provider := newMockProvider(profile)
	store := &mockUserStore{users: map[string]*auth.User{
		"existing@gmail.com": {ID: "existing-uuid", Email: "existing@gmail.com", EmailVerified: true},
	}}
	svc, state, cookieValue := newAuthorizedService(t, provider, store)

	user, _, err := svc.HandleGoogleCallback(context.Background(), "valid-code", state, cookieValue)
	require.NoError(t, err)
	assert.Equal(t, "existing-uuid", user.ID, "should return existing user")
}

func TestGoogleOAuth_AccountLinking(t *testing.T) {
	profile := &auth.OAuthProfile{
		Email:         "linked@gmail.com",
		EmailVerified: true,
		DisplayName:   "Linked User",
		ProviderID:    "google-id-link",
	}
	provider := newMockProvider(profile)
	store := &mockUserStore{users: map[string]*auth.User{
		"linked@gmail.com": {ID: "link-uuid", Email: "linked@gmail.com", EmailVerified: true},
	}}
	svc, state, cookieValue := newAuthorizedService(t, provider, store)

	user, _, err := svc.HandleGoogleCallback(context.Background(), "valid-code", state, cookieValue)
	require.NoError(t, err)
	assert.Equal(t, "link-uuid", user.ID, "should link Google to existing account")
}

func TestGoogleOAuth_GoogleIdentityLinkedElsewhereGetsSpecificCode(t *testing.T) {
	profile := &auth.OAuthProfile{
		Email:         "existing@gmail.com",
		EmailVerified: true,
		DisplayName:   "Existing User",
		ProviderID:    "google-id-owned-elsewhere",
	}
	provider := newMockProvider(profile)
	store := &mockUserStore{
		users: map[string]*auth.User{
			"existing@gmail.com": {ID: "existing-uuid", Email: "existing@gmail.com", EmailVerified: true},
			"other@gmail.com":    {ID: "other-uuid", Email: "other@gmail.com", EmailVerified: true},
		},
		oauthLinks: map[string]string{
			"google:google-id-owned-elsewhere": "other-uuid",
		},
	}
	svc, state, cookieValue := newAuthorizedService(t, provider, store)

	user, _, err := svc.HandleGoogleCallback(context.Background(), "valid-code", state, cookieValue)

	require.Error(t, err)
	assert.Nil(t, user)
	var oauthErr *auth.OAuthCallbackError
	require.ErrorAs(t, err, &oauthErr)
	assert.Equal(t, auth.OAuthErrGoogleLinkConflict, oauthErr.Code)
}

func TestGoogleOAuth_RawDriveAccountLinkedToDifferentGoogleGetsSpecificCode(t *testing.T) {
	profile := &auth.OAuthProfile{
		Email:         "existing@gmail.com",
		EmailVerified: true,
		DisplayName:   "Existing User",
		ProviderID:    "google-id-current",
	}
	provider := newMockProvider(profile)
	store := &mockUserStore{
		users: map[string]*auth.User{
			"existing@gmail.com": {ID: "existing-uuid", Email: "existing@gmail.com", EmailVerified: true},
		},
		links: map[string]string{
			linkKey("google", "google-id-stale"): "existing-uuid",
		},
	}
	svc, state, cookieValue := newAuthorizedService(t, provider, store)

	user, _, err := svc.HandleGoogleCallback(context.Background(), "valid-code", state, cookieValue)

	require.Error(t, err)
	assert.Nil(t, user)
	var oauthErr *auth.OAuthCallbackError
	require.ErrorAs(t, err, &oauthErr)
	assert.Equal(t, auth.OAuthErrRawDriveLinkConflict, oauthErr.Code)
}

func TestGoogleOAuth_RevokedConsent(t *testing.T) {
	provider := &mockOAuthProvider{
		exchangeFunc: func(code, codeVerifier string) (*auth.OAuthToken, error) {
			return nil, errors.New("consent revoked")
		},
		profileFunc: func(token *auth.OAuthToken, expectedNonce string) (*auth.OAuthProfile, error) {
			return nil, errors.New("no token")
		},
	}
	store := &mockUserStore{users: map[string]*auth.User{}}
	svc, state, cookieValue := newAuthorizedService(t, provider, store)

	user, _, err := svc.HandleGoogleCallback(context.Background(), "revoked-code", state, cookieValue)
	assert.Error(t, err, "revoked consent should produce an error")
	assert.Nil(t, user)
}

func TestGoogleOAuth_InvalidClientIsConfigurationError(t *testing.T) {
	provider := &mockOAuthProvider{
		exchangeFunc: func(code, codeVerifier string) (*auth.OAuthToken, error) {
			return nil, &auth.GoogleTokenError{StatusCode: 401, Code: "invalid_client"}
		},
		profileFunc: func(token *auth.OAuthToken, expectedNonce string) (*auth.OAuthProfile, error) {
			return nil, errors.New("no token")
		},
	}
	store := &mockUserStore{users: map[string]*auth.User{}}
	svc, state, cookieValue := newAuthorizedService(t, provider, store)

	user, _, err := svc.HandleGoogleCallback(context.Background(), "valid-code", state, cookieValue)

	require.Error(t, err)
	assert.Nil(t, user)
	var oauthErr *auth.OAuthCallbackError
	require.ErrorAs(t, err, &oauthErr)
	assert.Equal(t, auth.OAuthErrConfigUnavailable, oauthErr.Code)
	assert.False(t, svc.IsConfigured(), "invalid_client should disable public OAuth availability until config is fixed and service restarts")
}

func TestGoogleOAuth_ExpiredToken(t *testing.T) {
	provider := &mockOAuthProvider{
		exchangeFunc: func(code, codeVerifier string) (*auth.OAuthToken, error) {
			return &auth.OAuthToken{AccessToken: "expired-token", IDToken: "expired-id-token"}, nil
		},
		profileFunc: func(token *auth.OAuthToken, expectedNonce string) (*auth.OAuthProfile, error) {
			return nil, errors.New("token expired")
		},
	}
	store := &mockUserStore{users: map[string]*auth.User{}}
	svc, state, cookieValue := newAuthorizedService(t, provider, store)

	user, _, err := svc.HandleGoogleCallback(context.Background(), "valid-code", state, cookieValue)
	assert.Error(t, err, "expired OAuth token should produce an error")
	assert.Nil(t, user)
}

func TestGoogleOAuth_ProfileImport(t *testing.T) {
	profile := &auth.OAuthProfile{
		Email:         "profile@gmail.com",
		EmailVerified: true,
		DisplayName:   "Profile User",
		AvatarURL:     "https://lh3.googleusercontent.com/avatar.jpg",
		ProviderID:    "google-id-profile",
	}
	provider := newMockProvider(profile)
	store := &mockUserStore{users: map[string]*auth.User{}}
	svc, state, cookieValue := newAuthorizedService(t, provider, store)

	user, _, err := svc.HandleGoogleCallback(context.Background(), "valid-code", state, cookieValue)
	require.NoError(t, err)
	assert.Equal(t, "Profile User", user.DisplayName, "should import display name")
	assert.Equal(t, "https://lh3.googleusercontent.com/avatar.jpg", user.AvatarURL, "should import avatar URL")
}
