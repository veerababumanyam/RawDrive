package auth_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ──────────────────────────── Mock UserService ────────────────────────────

type mockUserService struct {
	users map[string]string // email -> userID
}

func newMockUserService() *mockUserService {
	return &mockUserService{users: make(map[string]string)}
}

func (m *mockUserService) Create(_ context.Context, email string) (string, error) {
	id := "user-" + email
	m.users[email] = id
	return id, nil
}

func (m *mockUserService) FindByEmail(_ context.Context, email string) (string, bool, error) {
	id, ok := m.users[email]
	return id, ok, nil
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
	r.Mount("/auth", handler.Routes())
	return httptest.NewServer(r)
}

func postJSON(url string, body interface{}) (*http.Response, error) {
	b, _ := json.Marshal(body)
	return http.Post(url, "application/json", bytes.NewReader(b))
}

// ──────────────────────────── Tests ────────────────────────────

func TestRegisterHandler_Success(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", map[string]string{
		"email": "test@example.com",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	var result map[string]string
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

	resp, err := postJSON(ts.URL+"/auth/register", map[string]string{
		"email": "dup@example.com",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusConflict, resp.StatusCode)
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
	assert.NotEmpty(t, result["refresh_token"])
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

	resp, err := client.Get(ts.URL + "/auth/oauth/google")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusFound, resp.StatusCode)
	loc := resp.Header.Get("Location")
	assert.Contains(t, loc, "accounts.google.com")
}

func TestRefreshTokenHandler_Success(t *testing.T) {
	handler, _, jwtSvc, _ := setupAuthRouter()

	// Generate a refresh token
	refreshToken, err := jwtSvc.GenerateRefreshToken(context.Background(), "user-1", "family-1")
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
	assert.NotEmpty(t, result["refresh_token"])
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

	resp, err := postJSON(ts.URL+"/auth/logout", map[string]string{
		"refresh_token": refreshToken,
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}
