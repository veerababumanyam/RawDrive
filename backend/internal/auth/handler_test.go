package auth_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ──────────────────────────── Mock UserService ────────────────────────────

type mockUserService struct {
	users       map[string]string // email -> userID
	errOnCreate bool
}

func newMockUserService() *mockUserService {
	return &mockUserService{users: make(map[string]string)}
}

func (m *mockUserService) Create(_ context.Context, email, password string, _ int) (string, error) {
	if m.errOnCreate {
		return "", errors.New("mock create error")
	}
	id := "mock-id-" + email
	m.users[email] = id
	return id, nil
}

func (m *mockUserService) FindByEmail(_ context.Context, email string) (string, bool, error) {
	id, ok := m.users[email]
	return id, ok, nil
}

func (m *mockUserService) VerifyPassword(_ context.Context, email, password string) (string, bool, bool, error) {
	id, ok := m.users[email]
	if !ok {
		return "", false, false, nil
	}
	return id, true, true, nil
}

func (m *mockUserService) MarkEmailVerified(_ context.Context, userID string) error {
	return nil
}

func (m *mockUserService) GetProfileByID(_ context.Context, userID string) (*auth.UserProfile, bool, error) {
	for email, id := range m.users {
		if id == userID {
			return &auth.UserProfile{
				ID:          id,
				Email:       email,
				DisplayName: "Mock User",
			}, true, nil
		}
	}
	return nil, false, nil
}

// ──────────────────────────── Helper ────────────────────────────

func setupAuthRouter() (*auth.Handler, auth.OTPService, auth.JWTService, *mockUserService) {
	otpSvc := auth.NewOTPService(auth.OTPConfig{
		CodeLength:      6,
		Expiry:          5 * time.Minute,
		MaxAttempts:     5,
		RateLimitMax:    10,
		RateLimitWindow: time.Minute,
	})
	jwtSvc := auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
		MaxSessions:        5,
	})
	userSvc := newMockUserService()
	handler := auth.NewHandler(otpSvc, jwtSvc, nil, userSvc)
	return handler, otpSvc, jwtSvc, userSvc
}

func newTestServer(handler *auth.Handler) *httptest.Server {
	r := chi.NewRouter()
	// Mirror main.go's wiring: the rate-limited credential endpoints
	// live at the ROOT (not inside the /auth subrouter) so they can
	// share a per-IP budget via a single middleware instance. In the
	// test server we register them without the limiter so tests don't
	// rate-limit themselves when running in quick succession.
	r.Post("/auth/register", handler.Register)
	r.Post("/auth/login", handler.Login)
	r.Post("/auth/verify-otp", handler.VerifyOTP)
	r.Mount("/auth", handler.Routes())
	return httptest.NewServer(r)
}

func postJSON(url string, body interface{}) (*http.Response, error) {
	b, _ := json.Marshal(body)
	return http.Post(url, "application/json", bytes.NewReader(b))
}

func refreshCookieFromResponse(t *testing.T, resp *http.Response) *http.Cookie {
	t.Helper()
	for _, cookie := range resp.Cookies() {
		if cookie.Name == "refresh_token" {
			return cookie
		}
	}
	t.Fatalf("expected refresh_token cookie in response")
	return nil
}

// ──────────────────────────── Tests ────────────────────────────

func TestRegisterHandler_Success(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    "test@example.com",
		"password": "TestPassword123!",
		"state_id": 14, // Maharashtra; any valid >0 id works for the handler-level check
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	var result map[string]any
	json.NewDecoder(resp.Body).Decode(&result)
	assert.Contains(t, result["message"], "OTP")
}

func TestRegisterHandler_InvalidEmail(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", map[string]string{
		"email": "not-an-email",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestRegisterHandler_DuplicateEmail(t *testing.T) {
	handler, _, _, userSvc := setupAuthRouter()
	// Pre-register
	userSvc.users["dup@example.com"] = "user-dup"

	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    "dup@example.com",
		"password": "TestPassword123!",
		"state_id": 14,
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusConflict, resp.StatusCode)
}

// TestRegisterHandler_MissingStateRejected asserts state selection is a
// hard gate at the handler boundary: a body without state_id (or with
// state_id <= 0) must 400 before the user is created. This is the
// server-side backstop for the UI lockout on the /register form.
func TestRegisterHandler_MissingStateRejected(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    "nostate@example.com",
		"password": "TestPassword123!",
		// state_id deliberately omitted
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var result map[string]string
	json.NewDecoder(resp.Body).Decode(&result)
	assert.Contains(t, result["error"], "state selection")
}

// TestRegisterHandler_ZeroStateRejected covers the explicit zero case:
// the frontend might naively send state_id=0 as a sentinel, we must 400.
func TestRegisterHandler_ZeroStateRejected(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    "zero@example.com",
		"password": "TestPassword123!",
		"state_id": 0,
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// ──────────────────────────── Plan selection (v0.0.46) ────────────────────────────

// TestRegisterHandler_PlanDefault asserts that omitting the plan field is
// accepted and the backend treats it as the free tier.
func TestRegisterHandler_PlanDefault(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    "planless@example.com",
		"password": "TestPassword123!",
		"state_id": 14,
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	var result map[string]any
	json.NewDecoder(resp.Body).Decode(&result)
	assert.Equal(t, "free", result["plan"], "missing plan should default to free")
}

// TestRegisterHandler_PlanValid walks all self-serve plan IDs and asserts
// each one is accepted and echoed back unchanged.
func TestRegisterHandler_PlanValid(t *testing.T) {
	for _, plan := range []string{"free", "starter", "professional", "business"} {
		t.Run(plan, func(t *testing.T) {
			handler, _, _, _ := setupAuthRouter()
			ts := newTestServer(handler)
			defer ts.Close()

			resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
				"email":    plan + "@example.com",
				"password": "TestPassword123!",
				"state_id": 14,
				"plan":     plan,
			})
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, http.StatusCreated, resp.StatusCode)
			var result map[string]any
			json.NewDecoder(resp.Body).Decode(&result)
			assert.Equal(t, plan, result["plan"])
		})
	}
}

// TestRegisterHandler_PlanInvalidFallback asserts that an unknown plan id
// is silently coerced to "free" rather than rejecting the registration.
// Rationale: we do not want a typo'd query param to block signup.
func TestRegisterHandler_PlanInvalidFallback(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    "bogus@example.com",
		"password": "TestPassword123!",
		"state_id": 14,
		"plan":     "unicorn",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	var result map[string]any
	json.NewDecoder(resp.Body).Decode(&result)
	assert.Equal(t, "free", result["plan"])
}

// TestRegisterHandler_PlanEnterpriseRejected asserts that enterprise is
// sales-gated and cannot be self-serve-registered. A curl bypass must 400.
func TestRegisterHandler_PlanEnterpriseRejected(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    "ent@example.com",
		"password": "TestPassword123!",
		"state_id": 14,
		"plan":     "enterprise",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	var result map[string]string
	json.NewDecoder(resp.Body).Decode(&result)
	assert.Contains(t, result["error"], "enterprise")
}

// ──────────────────────────── OAuth state gate (v0.0.47) ────────────────────────────

// TestOAuthGoogle_MissingStateIDRejected asserts that the /auth/oauth/google
// start endpoint refuses to issue a redirect without a state_id query param.
// This is the server-side backstop for the UI lockout on the "Continue with
// Google" button, so a curl or tampered form cannot bypass state selection
// for Google signups. Since setupAuthRouter() passes a nil OAuth service,
// the "OAuth not configured" 500 path would normally fire — but state_id
// validation happens BEFORE the nil check would, so this test still
// exercises the validation path deterministically.
func TestOAuthGoogle_MissingStateIDRejected(t *testing.T) {
	// Arrange: a handler with OAuth configured enough to pass the nil check.
	// We reuse the normal router setup; the OAuthGoogle handler short-circuits
	// on missing state_id before touching oauth, so a nil oauth service would
	// reach the "OAuth not configured" branch first. To isolate the state_id
	// check we construct a handler with a non-nil oauth service.
	otpSvc := auth.NewOTPService(auth.OTPConfig{
		CodeLength: 6, Expiry: time.Minute, MaxAttempts: 5,
		RateLimitMax: 10, RateLimitWindow: time.Minute,
	})
	jwtSvc := auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  time.Minute,
		RefreshTokenExpiry: time.Hour,
		MaxSessions:        5,
	})
	// Minimally configured OAuth service — enough for the nil-check in
	// OAuthGoogle to pass. The handler rejects before provider is ever called.
	oauthSvc := auth.NewOAuthService(
		auth.OAuthConfig{ClientID: "test", RedirectURI: "http://localhost/cb"},
		nil, nil,
	)
	handler := auth.NewHandler(otpSvc, jwtSvc, oauthSvc, newMockUserService())
	ts := newTestServer(handler)
	defer ts.Close()

	// All cases use intent=signup, because state_id is ONLY required when
	// the user is starting OAuth from the /register page. Login paths omit
	// `intent` and pass-through (see TestOAuthGoogle_LoginIntentAllowed).
	cases := []struct {
		name string
		url  string
	}{
		{"no state_id query", "/auth/oauth/google?intent=signup"},
		{"empty state_id", "/auth/oauth/google?intent=signup&state_id="},
		{"zero state_id", "/auth/oauth/google?intent=signup&state_id=0"},
		{"negative state_id", "/auth/oauth/google?intent=signup&state_id=-5"},
		{"non-numeric state_id", "/auth/oauth/google?intent=signup&state_id=abc"},
	}

	// Don't follow the 302 so a valid request is observable as a redirect,
	// not whatever Google's OAuth consent screen returns.
	client := &http.Client{
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp, err := client.Get(ts.URL + tc.url)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
			var result map[string]string
			json.NewDecoder(resp.Body).Decode(&result)
			assert.Contains(t, result["error"], "state selection")
		})
	}
}

// TestOAuthGoogle_LoginIntentAllowed asserts that OAuth requests WITHOUT
// `intent=signup` (i.e. Google login from /login) are allowed through
// without a state_id. Existing users already have a state set on their
// user row; we only gate the signup path.
func TestOAuthGoogle_LoginIntentAllowed(t *testing.T) {
	otpSvc := auth.NewOTPService(auth.OTPConfig{
		CodeLength: 6, Expiry: time.Minute, MaxAttempts: 5,
		RateLimitMax: 10, RateLimitWindow: time.Minute,
	})
	jwtSvc := auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  time.Minute,
		RefreshTokenExpiry: time.Hour,
		MaxSessions:        5,
	})
	oauthSvc := auth.NewOAuthService(
		auth.OAuthConfig{ClientID: "test", RedirectURI: "http://localhost/cb"},
		nil, nil,
	)
	handler := auth.NewHandler(otpSvc, jwtSvc, oauthSvc, newMockUserService())
	ts := newTestServer(handler)
	defer ts.Close()

	client := &http.Client{
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	// No intent, no state_id — this is the /login flow. Must 302 through.
	resp, err := client.Get(ts.URL + "/auth/oauth/google")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusFound, resp.StatusCode,
		"login-path OAuth start should 302 without state_id")
	assert.Contains(t, resp.Header.Get("Location"), "accounts.google.com")
}

// TestOAuthGoogle_ValidStateIDRedirects asserts the happy path: with
// intent=signup and a valid state_id the handler issues a 302 redirect
// to Google.
func TestOAuthGoogle_ValidStateIDRedirects(t *testing.T) {
	otpSvc := auth.NewOTPService(auth.OTPConfig{
		CodeLength: 6, Expiry: time.Minute, MaxAttempts: 5,
		RateLimitMax: 10, RateLimitWindow: time.Minute,
	})
	jwtSvc := auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  time.Minute,
		RefreshTokenExpiry: time.Hour,
		MaxSessions:        5,
	})
	oauthSvc := auth.NewOAuthService(
		auth.OAuthConfig{ClientID: "test", RedirectURI: "http://localhost/cb"},
		nil, nil,
	)
	handler := auth.NewHandler(otpSvc, jwtSvc, oauthSvc, newMockUserService())
	ts := newTestServer(handler)
	defer ts.Close()

	client := &http.Client{
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Get(ts.URL + "/auth/oauth/google?intent=signup&state_id=14")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusFound, resp.StatusCode, "expected 302 redirect to Google")
	assert.Contains(t, resp.Header.Get("Location"), "accounts.google.com",
		"expected redirect to Google's OAuth endpoint")
}

func TestVerifyOTPHandler_Success(t *testing.T) {
	handler, otpSvc, _, userSvc := setupAuthRouter()
	// Create user first
	userSvc.users["verify@example.com"] = "user-verify"

	// Generate a valid OTP
	code, err := otpSvc.Generate(context.Background(), "verify@example.com")
	require.NoError(t, err)

	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/verify-otp", map[string]string{
		"email": "verify@example.com",
		"code":  code,
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result map[string]string
	json.NewDecoder(resp.Body).Decode(&result)
	assert.NotEmpty(t, result["access_token"])
	assert.Empty(t, result["refresh_token"], "refresh token must not be returned in JSON")
	assert.NotEmpty(t, refreshCookieFromResponse(t, resp).Value)
}

func TestVerifyOTPHandler_WrongCode(t *testing.T) {
	handler, otpSvc, _, userSvc := setupAuthRouter()
	userSvc.users["wrong@example.com"] = "user-wrong"
	_, _ = otpSvc.Generate(context.Background(), "wrong@example.com")

	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/verify-otp", map[string]string{
		"email": "wrong@example.com",
		"code":  "000000",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestVerifyOTPHandler_Expired(t *testing.T) {
	// Use a very short expiry
	otpSvc := auth.NewOTPService(auth.OTPConfig{
		CodeLength:      6,
		Expiry:          1 * time.Millisecond,
		MaxAttempts:     5,
		RateLimitMax:    10,
		RateLimitWindow: time.Minute,
	})
	jwtSvc := auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
		MaxSessions:        5,
	})
	userSvc := newMockUserService()
	userSvc.users["expired@example.com"] = "user-expired"
	handler := auth.NewHandler(otpSvc, jwtSvc, nil, userSvc)

	code, err := otpSvc.Generate(context.Background(), "expired@example.com")
	require.NoError(t, err)

	// Wait for expiry
	time.Sleep(10 * time.Millisecond)

	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/verify-otp", map[string]string{
		"email": "expired@example.com",
		"code":  code,
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestOAuthGoogleHandler_Redirect(t *testing.T) {
	otpSvc := auth.NewOTPService(auth.OTPConfig{
		CodeLength:      6,
		Expiry:          5 * time.Minute,
		MaxAttempts:     5,
		RateLimitMax:    10,
		RateLimitWindow: time.Minute,
	})
	jwtSvc := auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
		MaxSessions:        5,
	})
	userSvc := newMockUserService()

	// Create a minimal OAuthService
	oauthSvc := auth.NewOAuthService(auth.OAuthConfig{ClientID: "test-client", RedirectURI: "http://localhost/callback"}, nil, nil)
	handler := auth.NewHandler(otpSvc, jwtSvc, oauthSvc, userSvc)

	ts := newTestServer(handler)
	defer ts.Close()

	// Use a client that doesn't follow redirects
	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	// This is the login-path OAuth start: no `intent=signup`, so state_id
	// is NOT required (existing users already have state set). The
	// TestOAuthGoogle_MissingStateIDRejected test exercises the signup path
	// where state_id IS required.
	resp, err := client.Get(ts.URL + "/auth/oauth/google")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusFound, resp.StatusCode)
	loc := resp.Header.Get("Location")
	assert.Contains(t, loc, "accounts.google.com")
}

func TestOAuthGoogleCallback_DoesNotLeakTokensInRedirect(t *testing.T) {
	otpSvc := auth.NewOTPService(auth.OTPConfig{
		CodeLength:      6,
		Expiry:          5 * time.Minute,
		MaxAttempts:     5,
		RateLimitMax:    10,
		RateLimitWindow: time.Minute,
	})
	jwtSvc := auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
		MaxSessions:        5,
	})

	profile := &auth.OAuthProfile{
		Email:       "oauth@example.com",
		DisplayName: "OAuth User",
		ProviderID:  "google-oauth-test",
	}
	oauthSvc, state := newAuthorizedService(t, newMockProvider(profile), &mockUserStore{users: map[string]*auth.User{}})
	handler := auth.NewHandler(otpSvc, jwtSvc, oauthSvc, newMockUserService())

	ts := newTestServer(handler)
	defer ts.Close()

	client := &http.Client{CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	resp, err := client.Get(ts.URL + "/auth/oauth/google/callback?code=valid-code&state=" + url.QueryEscape(state))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusFound, resp.StatusCode)
	location := resp.Header.Get("Location")
	assert.NotContains(t, location, "access_token=")
	assert.NotContains(t, location, "refresh_token=")

	parsed, err := url.Parse(location)
	require.NoError(t, err)
	assert.Equal(t, "1", parsed.Query().Get("authenticated"))
	assert.NotEmpty(t, refreshCookieFromResponse(t, resp).Value)
}

func TestRefreshTokenHandler_Success(t *testing.T) {
	handler, _, jwtSvc, _ := setupAuthRouter()

	// Generate a refresh token
	refreshToken, err := jwtSvc.GenerateRefreshToken(context.Background(), "user-1", "family-1")
	require.NoError(t, err)

	ts := newTestServer(handler)
	defer ts.Close()

	req, err := http.NewRequest(http.MethodPost, ts.URL+"/auth/refresh", nil)
	require.NoError(t, err)
	req.AddCookie(&http.Cookie{Name: "refresh_token", Value: refreshToken})
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result map[string]string
	json.NewDecoder(resp.Body).Decode(&result)
	assert.NotEmpty(t, result["access_token"])
	assert.Empty(t, result["refresh_token"], "rotated refresh token must stay in HttpOnly cookie")
	assert.NotEmpty(t, refreshCookieFromResponse(t, resp).Value)
}

func TestRefreshTokenHandler_LegacyBodyFallbackDoesNotReturnRefreshToken(t *testing.T) {
	handler, _, jwtSvc, _ := setupAuthRouter()

	refreshToken, err := jwtSvc.GenerateRefreshToken(context.Background(), "user-legacy", "family-legacy")
	require.NoError(t, err)

	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/refresh", map[string]string{
		"refresh_token": refreshToken,
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result map[string]string
	json.NewDecoder(resp.Body).Decode(&result)
	assert.NotEmpty(t, result["access_token"])
	assert.Empty(t, result["refresh_token"], "legacy body input must not re-expose refresh token")
	assert.NotEmpty(t, refreshCookieFromResponse(t, resp).Value)
}

func TestRefreshTokenHandler_InvalidToken(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()

	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/refresh", map[string]string{
		"refresh_token": "invalid-token",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestLogoutHandler_Success(t *testing.T) {
	handler, _, jwtSvc, _ := setupAuthRouter()

	refreshToken, err := jwtSvc.GenerateRefreshToken(context.Background(), "user-1", "family-logout")
	require.NoError(t, err)

	ts := newTestServer(handler)
	defer ts.Close()

	req, err := http.NewRequest(http.MethodPost, ts.URL+"/auth/logout", nil)
	require.NoError(t, err)
	req.AddCookie(&http.Cookie{Name: "refresh_token", Value: refreshToken})
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
	assert.Equal(t, -1, refreshCookieFromResponse(t, resp).MaxAge)
}
