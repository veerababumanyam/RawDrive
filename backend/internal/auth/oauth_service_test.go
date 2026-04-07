package auth_test

import (
	"context"
	"errors"
	"testing"

	"github.com/rawdrive/backend/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockOAuthProvider simulates a Google OAuth provider for testing.
type mockOAuthProvider struct {
	exchangeFunc func(code string) (*auth.OAuthToken, error)
	profileFunc  func(token *auth.OAuthToken) (*auth.OAuthProfile, error)
}

func (m *mockOAuthProvider) ExchangeCode(ctx context.Context, code string) (*auth.OAuthToken, error) {
	return m.exchangeFunc(code)
}

func (m *mockOAuthProvider) GetProfile(ctx context.Context, token *auth.OAuthToken) (*auth.OAuthProfile, error) {
	return m.profileFunc(token)
}

// mockUserStore simulates user persistence for OAuth tests.
type mockUserStore struct {
	users map[string]*auth.User
}

func (m *mockUserStore) FindByEmail(ctx context.Context, email string) (*auth.User, error) {
	if u, ok := m.users[email]; ok {
		return u, nil
	}
	return nil, nil
}

func (m *mockUserStore) Create(ctx context.Context, u *auth.User) (*auth.User, error) {
	m.users[u.Email] = u
	return u, nil
}

func (m *mockUserStore) LinkOAuth(ctx context.Context, userID, provider, providerID string) error {
	return nil
}

func newMockProvider(profile *auth.OAuthProfile) *mockOAuthProvider {
	return &mockOAuthProvider{
		exchangeFunc: func(code string) (*auth.OAuthToken, error) {
			return &auth.OAuthToken{AccessToken: "mock-access-token"}, nil
		},
		profileFunc: func(token *auth.OAuthToken) (*auth.OAuthProfile, error) {
			return profile, nil
		},
	}
}

func TestGoogleOAuth_InitiateFlow(t *testing.T) {
	provider := newMockProvider(nil)
	svc := auth.NewOAuthService(provider, &mockUserStore{users: map[string]*auth.User{}})
	ctx := context.Background()

	redirectURL, err := svc.InitiateGoogleAuth(ctx)
	require.NoError(t, err)
	assert.NotEmpty(t, redirectURL)
	assert.Contains(t, redirectURL, "code_challenge", "should include PKCE code_challenge")
	assert.Contains(t, redirectURL, "state=", "should include state parameter")
}

func TestGoogleOAuth_HandleCallback(t *testing.T) {
	profile := &auth.OAuthProfile{
		Email:       "user@gmail.com",
		DisplayName: "Test User",
		AvatarURL:   "https://example.com/avatar.jpg",
		ProviderID:  "google-id-123",
	}
	provider := newMockProvider(profile)
	store := &mockUserStore{users: map[string]*auth.User{}}
	svc := auth.NewOAuthService(provider, store)
	ctx := context.Background()

	user, err := svc.HandleGoogleCallback(ctx, "valid-code", "valid-state")
	require.NoError(t, err)
	require.NotNil(t, user)
	assert.Equal(t, "user@gmail.com", user.Email)
}

func TestGoogleOAuth_NewUser(t *testing.T) {
	profile := &auth.OAuthProfile{
		Email:       "newuser@gmail.com",
		DisplayName: "New User",
		AvatarURL:   "https://example.com/avatar.jpg",
		ProviderID:  "google-id-new",
	}
	provider := newMockProvider(profile)
	store := &mockUserStore{users: map[string]*auth.User{}}
	svc := auth.NewOAuthService(provider, store)
	ctx := context.Background()

	user, err := svc.HandleGoogleCallback(ctx, "valid-code", "valid-state")
	require.NoError(t, err)
	require.NotNil(t, user)
	assert.Equal(t, "newuser@gmail.com", user.Email)
	assert.NotEmpty(t, user.ID, "new user should have an assigned ID")
}

func TestGoogleOAuth_ExistingUser(t *testing.T) {
	profile := &auth.OAuthProfile{
		Email:       "existing@gmail.com",
		DisplayName: "Existing User",
		ProviderID:  "google-id-existing",
	}
	provider := newMockProvider(profile)
	store := &mockUserStore{users: map[string]*auth.User{
		"existing@gmail.com": {ID: "existing-uuid", Email: "existing@gmail.com"},
	}}
	svc := auth.NewOAuthService(provider, store)
	ctx := context.Background()

	user, err := svc.HandleGoogleCallback(ctx, "valid-code", "valid-state")
	require.NoError(t, err)
	assert.Equal(t, "existing-uuid", user.ID, "should return existing user")
}

func TestGoogleOAuth_AccountLinking(t *testing.T) {
	profile := &auth.OAuthProfile{
		Email:       "linked@gmail.com",
		DisplayName: "Linked User",
		ProviderID:  "google-id-link",
	}
	provider := newMockProvider(profile)
	store := &mockUserStore{users: map[string]*auth.User{
		"linked@gmail.com": {ID: "link-uuid", Email: "linked@gmail.com"},
	}}
	svc := auth.NewOAuthService(provider, store)
	ctx := context.Background()

	user, err := svc.HandleGoogleCallback(ctx, "valid-code", "valid-state")
	require.NoError(t, err)
	assert.Equal(t, "link-uuid", user.ID, "should link Google to existing account")
}

func TestGoogleOAuth_RevokedConsent(t *testing.T) {
	provider := &mockOAuthProvider{
		exchangeFunc: func(code string) (*auth.OAuthToken, error) {
			return nil, errors.New("consent revoked")
		},
		profileFunc: func(token *auth.OAuthToken) (*auth.OAuthProfile, error) {
			return nil, errors.New("no token")
		},
	}
	store := &mockUserStore{users: map[string]*auth.User{}}
	svc := auth.NewOAuthService(provider, store)
	ctx := context.Background()

	user, err := svc.HandleGoogleCallback(ctx, "revoked-code", "valid-state")
	assert.Error(t, err, "revoked consent should produce an error")
	assert.Nil(t, user)
}

func TestGoogleOAuth_ExpiredToken(t *testing.T) {
	provider := &mockOAuthProvider{
		exchangeFunc: func(code string) (*auth.OAuthToken, error) {
			return &auth.OAuthToken{AccessToken: "expired-token"}, nil
		},
		profileFunc: func(token *auth.OAuthToken) (*auth.OAuthProfile, error) {
			return nil, errors.New("token expired")
		},
	}
	store := &mockUserStore{users: map[string]*auth.User{}}
	svc := auth.NewOAuthService(provider, store)
	ctx := context.Background()

	user, err := svc.HandleGoogleCallback(ctx, "valid-code", "valid-state")
	assert.Error(t, err, "expired OAuth token should produce an error")
	assert.Nil(t, user)
}

func TestGoogleOAuth_ProfileImport(t *testing.T) {
	profile := &auth.OAuthProfile{
		Email:       "profile@gmail.com",
		DisplayName: "Profile User",
		AvatarURL:   "https://lh3.googleusercontent.com/avatar.jpg",
		ProviderID:  "google-id-profile",
	}
	provider := newMockProvider(profile)
	store := &mockUserStore{users: map[string]*auth.User{}}
	svc := auth.NewOAuthService(provider, store)
	ctx := context.Background()

	user, err := svc.HandleGoogleCallback(ctx, "valid-code", "valid-state")
	require.NoError(t, err)
	assert.Equal(t, "Profile User", user.DisplayName, "should import display name")
	assert.Equal(t, "https://lh3.googleusercontent.com/avatar.jpg", user.AvatarURL, "should import avatar URL")
}
