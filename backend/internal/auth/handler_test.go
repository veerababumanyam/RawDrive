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
	verified    map[string]bool   // email -> emailVerified (added with ResendOTP)
	errOnCreate bool
}

func newMockUserService() *mockUserService {
	return &mockUserService{users: make(map[string]string), verified: make(map[string]bool)}
}

func (m *mockUserService) Create(_ context.Context, email, password, _, _ string) (string, error) {
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
	for email, id := range m.users {
		if id == userID {
			if m.verified == nil {
				m.verified = make(map[string]bool)
			}
			m.verified[email] = true
			return nil
		}
	}
	return nil
}

func (m *mockUserService) IsEmailVerified(_ context.Context, email string) (bool, bool, error) {
	if _, ok := m.users[email]; !ok {
		return false, false, nil
	}
	return m.verified[email], true, nil
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

func (m *mockUserService) ChangePassword(_ context.Context, _, _, _ string) error {
	return nil
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
	r.Post("/auth/resend-otp", handler.ResendOTP)
	r.Mount("/auth", handler.Routes())
	return httptest.NewServer(r)
}

func newSubrouterOnlyTestServer(handler *auth.Handler) *httptest.Server {
	r := chi.NewRouter()
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

func TestRoutes_CredentialEndpointsNotMountedInSubrouter(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newSubrouterOnlyTestServer(handler)
	defer ts.Close()

	for _, path := range []string{"/auth/register", "/auth/login", "/auth/verify-otp"} {
		resp, err := postJSON(ts.URL+path, map[string]string{})
		require.NoError(t, err)
		resp.Body.Close()
		assert.Equal(t, http.StatusNotFound, resp.StatusCode, "%s must stay root-mounted for rate limiting", path)
	}

	req, err := http.NewRequest(http.MethodPost, ts.URL+"/auth/refresh", nil)
	require.NoError(t, err)
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode, "non-credential auth routes should remain in Routes()")
}

func TestRegisterHandler_Success(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    "test@example.com",
		"password": "TestPassword123!",
		"phone":    "9876543210",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	var result map[string]any
	json.NewDecoder(resp.Body).Decode(&result)
	assert.Contains(t, result["message"], "OTP")
}

func TestRegisterHandler_MissingPhoneRejected(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    "nophone@example.com",
		"password": "TestPassword123!",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	var result map[string]string
	json.NewDecoder(resp.Body).Decode(&result)
	assert.Contains(t, result["error"], "phone")
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
		"phone":    "9876543210",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusConflict, resp.StatusCode)
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
		"phone":    "9000000001",
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
				"phone":    "9000000002",
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
		"phone":    "9000000003",
		"plan":     "unicorn",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	var result map[string]any
	json.NewDecoder(resp.Body).Decode(&result)
	assert.Equal(t, "free", result["plan"])
}

// TestRegisterHandler_PlanEnterprise asserts that enterprise is now a valid
// self-serve plan and can be registered like any other plan.
func TestRegisterHandler_PlanEnterprise(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    "ent@example.com",
		"password": "TestPassword123!",
		"phone":    "9000000004",
		"plan":     "enterprise",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	var result map[string]any
	json.NewDecoder(resp.Body).Decode(&result)
	assert.Equal(t, "enterprise", result["plan"])
}

// ──────────────────────────── OAuth Google ────────────────────────────

func newOAuthHandler() (*auth.Handler, *httptest.Server) {
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
	return handler, newTestServer(handler)
}

// TestOAuthGoogle_SignupRedirects asserts that intent=signup issues a 302
// to Google without requiring a state_id.
func TestOAuthGoogle_SignupRedirects(t *testing.T) {
	_, ts := newOAuthHandler()
	defer ts.Close()

	client := &http.Client{
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Get(ts.URL + "/auth/oauth/google?intent=signup")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusFound, resp.StatusCode, "expected 302 redirect to Google")
	assert.Contains(t, resp.Header.Get("Location"), "accounts.google.com")
}

// TestOAuthGoogle_LoginRedirects asserts that a login OAuth start (no intent)
// also redirects to Google.
func TestOAuthGoogle_LoginRedirects(t *testing.T) {
	_, ts := newOAuthHandler()
	defer ts.Close()

	client := &http.Client{
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Get(ts.URL + "/auth/oauth/google")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusFound, resp.StatusCode,
		"login-path OAuth start should 302 to Google")
	assert.Contains(t, resp.Header.Get("Location"), "accounts.google.com")
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

// ─────────────────────────── ResendOTP ───────────────────────────
//
// ResendOTP must be account-enumeration-resistant: every successful
// dispatch (valid email format) returns the same 200 + generic message
// regardless of whether the account exists, is verified, or is unknown.
// The OTP itself is only minted in the unverified+exists branch — these
// tests assert both the response shape and the side-effect.

func TestResendOTPHandler_UnverifiedAccount_GeneratesNewCode(t *testing.T) {
	handler, otpSvc, _, userSvc := setupAuthRouter()
	userSvc.users["unverified@example.com"] = "user-unverified"
	// userSvc.verified["unverified@example.com"] stays false (zero value)

	// Generate an initial code so we can prove resend issues a fresh one.
	original, err := otpSvc.Generate(context.Background(), "unverified@example.com")
	require.NoError(t, err)

	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/resend-otp", map[string]string{
		"email": "unverified@example.com",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	var body map[string]string
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.NotEmpty(t, body["message"], "response must carry a generic message")
	assert.Empty(t, body["error"])

	// Validate that a NEW code was minted: the old one should no longer
	// authenticate (Generate replaces the prior entry per identifier).
	valid, err := otpSvc.Validate(context.Background(), "unverified@example.com", original)
	require.NoError(t, err)
	assert.False(t, valid, "the original OTP must be superseded by the resend")
}

func TestResendOTPHandler_AlreadyVerified_NoOpButSameResponse(t *testing.T) {
	handler, otpSvc, _, userSvc := setupAuthRouter()
	userSvc.users["verified@example.com"] = "user-verified"
	userSvc.verified["verified@example.com"] = true

	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/resend-otp", map[string]string{
		"email": "verified@example.com",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	// No OTP must have been generated for a verified account — the
	// freshly-minted Validate call should fail because there is no
	// outstanding entry.
	valid, _ := otpSvc.Validate(context.Background(), "verified@example.com", "000000")
	assert.False(t, valid, "verified accounts must not have an active OTP after resend")
}

func TestResendOTPHandler_UnknownEmail_NoOpButSameResponse(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()

	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/resend-otp", map[string]string{
		"email": "nobody@example.com",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	// Same 200 envelope as the unverified path so callers cannot
	// distinguish "no account" from "unverified account".
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestResendOTPHandler_InvalidEmailRejected(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/resend-otp", map[string]string{
		"email": "not-an-email",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestResendOTPHandler_BadJSON(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := http.Post(ts.URL+"/auth/resend-otp", "application/json", bytes.NewBufferString("{not-json"))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
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
