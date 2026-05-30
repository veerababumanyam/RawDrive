package auth_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
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

func (m *mockUserService) Create(_ context.Context, email, password, _, _ string, _ *int, _ string) (string, error) {
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

// ─────────────────────────── F-011: MFA preserved across post-onboarding refresh ───────────────────────────

// stubWorkspaceLookup returns a fixed workspace/state/role tuple for every
// user, simulating the "onboarding just completed → workspace now exists"
// transition that drives RefreshToken's access-token regeneration branch.
type stubWorkspaceLookup struct {
	wsID, stateID, role, platformRole string
}

func (s stubWorkspaceLookup) GetUserWorkspace(_ context.Context, _ string) (string, string, string, string, error) {
	return s.wsID, s.stateID, s.role, s.platformRole, nil
}

// TestRefreshToken_PreservesMFAVerifiedAfterWorkspaceChange is the F-011
// regression. A user logs in with MFA (mfa_verified=true) BEFORE their
// workspace exists, so the refresh token carries workspace_id=pending-onboarding
// + mfa_verified=true. On the first refresh AFTER onboarding completes, the
// handler detects the workspace changed and regenerates the access token. That
// regeneration must carry MFAVerified forward — before the fix it dropped the
// field, silently downgrading the verified session to mfa_verified=false and
// violating the documented "refresh preserves mfa_verified" invariant.
func TestRefreshToken_PreservesMFAVerifiedAfterWorkspaceChange(t *testing.T) {
	jwtSvc := auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
		MaxSessions:        5,
	})

	// Pre-onboarding refresh token: mfa_verified=true, workspace pending.
	refreshToken, err := jwtSvc.GenerateRefreshTokenWithMFA(
		context.Background(),
		"00000000-0000-0000-0000-000000000001",
		"family-f011",
		"pending-onboarding",
		"Owner",
		"photographer",
		"pending-onboarding",
		true, // mfa_verified
	)
	require.NoError(t, err)

	// Onboarding completed: the workspace lookup now returns a real workspace,
	// which differs from the token's "pending-onboarding" and forces the
	// access-token regeneration branch in RefreshToken.
	handler := auth.NewHandler(nil, jwtSvc, nil, nil).
		WithWorkspaceLookup(stubWorkspaceLookup{
			wsID:         "11111111-1111-1111-1111-111111111111",
			stateID:      "state-1",
			role:         "Owner",
			platformRole: "photographer",
		})

	ts := newTestServer(handler)
	defer ts.Close()

	req, err := http.NewRequest(http.MethodPost, ts.URL+"/auth/refresh", nil)
	require.NoError(t, err)
	req.AddCookie(&http.Cookie{Name: "refresh_token", Value: refreshToken})
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var result map[string]string
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	require.NotEmpty(t, result["access_token"])

	// Parse the regenerated access token and assert it still claims MFA.
	claims, err := jwtSvc.ParseAccessToken(context.Background(), result["access_token"])
	require.NoError(t, err)
	assert.Equal(t, "11111111-1111-1111-1111-111111111111", claims.WorkspaceID,
		"regenerated token should carry the freshly-resolved workspace")
	assert.True(t, claims.MFAVerified,
		"F-011: post-onboarding refresh must NOT downgrade mfa_verified — "+
			"the regenerated access token must preserve MFAVerified=true")
}

// ─────────────────────────── F-056: max password length at registration ───────────────────────────

// TestRegisterHandler_RejectsOverlongPassword is the F-056 regression. Before
// the fix Register only enforced a MINIMUM length, so a password longer than
// bcrypt's 72-byte truncation boundary was accepted and silently weakened
// (bytes past 72 add no strength; two such passwords collide). Register must
// now reject anything over the 128-byte cap with a 400 before it ever reaches
// the downstream hashing site in h.users.Create.
func TestRegisterHandler_RejectsOverlongPassword(t *testing.T) {
	handler, _, _, userSvc := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	// 129 bytes — one over the cap.
	longPassword := "Aa1!" + strings.Repeat("x", 125)
	require.Len(t, longPassword, 129)

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    "toolong@example.com",
		"password": longPassword,
		"phone":    "9000000005",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode,
		"F-056: password longer than 128 bytes must be rejected, not hashed")

	var body map[string]string
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "at most")

	// The over-long password must never have reached the user store.
	_, exists, _ := userSvc.FindByEmail(context.Background(), "toolong@example.com")
	assert.False(t, exists, "no user should be created when the password is rejected")
}

// TestRegisterHandler_AcceptsBoundaryLengthPassword guards the cap boundary:
// a password of exactly 128 bytes is still accepted, so the F-056 fix does not
// over-correct and lock out legitimate long passphrases.
func TestRegisterHandler_AcceptsBoundaryLengthPassword(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	boundaryPassword := "Aa1!" + strings.Repeat("x", 124)
	require.Len(t, boundaryPassword, 128)

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    "boundary@example.com",
		"password": boundaryPassword,
		"phone":    "9000000006",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode,
		"a 128-byte password is exactly at the cap and must still register")
}

// ─────────────────────────── F-070: emails masked in logs ───────────────────────────

// TestMaskEmail_RedactsLocalPart unit-tests the masking rule directly: only
// the first character of the local part survives; the full domain is kept for
// support correlation; malformed inputs never echo verbatim.
func TestMaskEmail_RedactsLocalPart(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"alice@example.com", "a***@example.com"},
		{"bob.smith@studio.co.in", "b***@studio.co.in"},
		{"x@y.com", "x***@y.com"},
		{"", ""},
		{"no-at-sign", "[redacted]"},
		{"@nolocal.com", "[redacted]"},
		{"trailingat@", "[redacted]"},
	}
	for _, c := range cases {
		got := auth.MaskEmailForTest(c.in)
		assert.Equal(t, c.want, got, "maskEmail(%q)", c.in)
		if c.in != "" && strings.Contains(c.in, "@") && c.want != "[redacted]" {
			// The raw local part must never survive intact.
			rawLocal := c.in[:strings.LastIndex(c.in, "@")]
			if len(rawLocal) > 1 {
				assert.NotContains(t, got, rawLocal,
					"F-070: full local part must not appear in masked output")
			}
		}
	}
}

// TestRegisterHandler_DoesNotLogRawEmail is the F-070 behavioral regression.
// The Register create-error path logs a diagnostic line; before the fix it
// embedded the raw req.Email, leaking PII into the log sink. The line must now
// carry only the masked form.
func TestRegisterHandler_DoesNotLogRawEmail(t *testing.T) {
	handler, _, _, userSvc := setupAuthRouter()
	userSvc.errOnCreate = true // force the logged create-failure branch
	ts := newTestServer(handler)
	defer ts.Close()

	// Capture everything written to the standard logger.
	var logBuf bytes.Buffer
	prevOut := log.Writer()
	prevFlags := log.Flags()
	log.SetOutput(&logBuf)
	log.SetFlags(0)
	defer func() {
		log.SetOutput(prevOut)
		log.SetFlags(prevFlags)
	}()

	const rawEmail = "secretuser@example.com"
	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    rawEmail,
		"password": "TestPassword123!",
		"phone":    "9000000007",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusInternalServerError, resp.StatusCode,
		"errOnCreate should drive the logged failure branch")

	logged := logBuf.String()
	require.NotEmpty(t, logged, "the create-failure branch must emit a log line")
	assert.NotContains(t, logged, rawEmail,
		"F-070: raw email must never be written to logs")
	assert.Contains(t, logged, "s***@example.com",
		"F-070: the masked email must be present for support correlation")
}
