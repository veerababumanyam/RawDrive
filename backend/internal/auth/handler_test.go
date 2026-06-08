package auth_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/auth"
)

// ──────────────────────────── Mock UserService ────────────────────────────

type mockUserService struct {
	users       map[string]string // email -> userID
	verified    map[string]bool   // email -> emailVerified (added with ResendOTP)
	errOnCreate bool
	// createReturnsUUID makes Create return a real uuid (matching production,
	// where users.id is a UUID) instead of the default "mock-id-<email>".
	// Needed by tests that exercise code parsing the returned id as a UUID
	// (e.g. registration terms-acceptance capture).
	createReturnsUUID bool
	// phone-reuse epic: phonesInUse[normalized]=true makes PhoneInUse report a
	// duplicate; lastReuseState captures the state passed to the most recent
	// Create so routing tests can assert free vs paid_pending.
	phonesInUse    map[string]bool
	lastReuseState string
}

func newMockUserService() *mockUserService {
	return &mockUserService{users: make(map[string]string), verified: make(map[string]bool), phonesInUse: make(map[string]bool)}
}

func (m *mockUserService) Create(_ context.Context, email, password, _, _ string, _ *int, _, phoneReuseState string) (string, error) {
	if m.errOnCreate {
		return "", errors.New("mock create error")
	}
	m.lastReuseState = phoneReuseState
	id := "mock-id-" + email
	if m.createReturnsUUID {
		id = uuid.NewString()
	}
	m.users[email] = id
	return id, nil
}

func (m *mockUserService) PhoneInUse(_ context.Context, normalized string) (bool, error) {
	if normalized == "" {
		return false, nil
	}
	return m.phonesInUse[normalized], nil
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

func accessCookieFromResponse(t *testing.T, resp *http.Response) *http.Cookie {
	t.Helper()
	for _, cookie := range resp.Cookies() {
		if cookie.Name == auth.AccessTokenCookieName {
			return cookie
		}
	}
	t.Fatalf("expected %s cookie in response", auth.AccessTokenCookieName)
	return nil
}

func oauthStateCookie(value string) *http.Cookie {
	return &http.Cookie{
		Name:  "rawdrive_oauth_state",
		Value: value,
		Path:  "/",
	}
}

func findCookie(cookies []*http.Cookie, name string) *http.Cookie {
	for _, cookie := range cookies {
		if cookie.Name == name {
			return cookie
		}
	}
	return nil
}

type verifiedMFAEnrollmentStore struct {
	userID uuid.UUID
}

func (s verifiedMFAEnrollmentStore) Create(context.Context, *auth.MFAEnrollmentRow) error {
	return nil
}

func (s verifiedMFAEnrollmentStore) GetByUserID(_ context.Context, userID uuid.UUID) (*auth.MFAEnrollmentRow, error) {
	if userID != s.userID {
		return nil, auth.ErrMFANotEnrolled
	}
	now := time.Now()
	return &auth.MFAEnrollmentRow{
		ID:             uuid.New(),
		UserID:         userID,
		LastVerifiedAt: &now,
	}, nil
}

func (s verifiedMFAEnrollmentStore) UpdateLastVerified(context.Context, uuid.UUID) error {
	return nil
}

func (s verifiedMFAEnrollmentStore) Delete(context.Context, uuid.UUID) error {
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
	// OBS-1: /auth/refresh is still reachable inside the subrouter (proving the
	// route is mounted in Routes()), but a no-credential probe now answers 204
	// ("no active session") instead of a noisy 400.
	assert.Equal(t, http.StatusNoContent, resp.StatusCode, "non-credential auth routes should remain in Routes()")
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

// stubTermsManager records AcceptTerms calls so the registration-capture test
// can assert the one-time acceptance is persisted with the right method.
type stubTermsManager struct {
	calls   int
	userID  uuid.UUID
	method  string
	ip      string
	ua      string
	version string
}

func (s *stubTermsManager) AcceptTerms(_ context.Context, userID uuid.UUID, method, ip, ua string) (string, error) {
	s.calls++
	s.userID = userID
	s.method = method
	s.ip = ip
	s.ua = ua
	return "tos-privacy/2026-04", nil
}

func (s *stubTermsManager) TermsStatusForUser(_ context.Context, _ uuid.UUID) (bool, string, *time.Time, string, error) {
	return false, "tos-privacy/2026-04", nil, "tos-privacy/2026-04", nil
}

func TestRegisterHandler_CapturesTermsAcceptance(t *testing.T) {
	handler, _, _, userSvc := setupAuthRouter()
	userSvc.createReturnsUUID = true
	terms := &stubTermsManager{}
	handler = handler.WithTerms(terms)
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":          "tos@example.com",
		"password":       "TestPassword123!",
		"phone":          "9876500000",
		"terms_accepted": true,
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	require.Equal(t, 1, terms.calls, "registration with terms_accepted=true must record one acceptance")
	assert.Equal(t, "registration", terms.method)
	assert.NotEqual(t, uuid.Nil, terms.userID)
}

func TestRegisterHandler_NoTermsAcceptanceWhenUnchecked(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	terms := &stubTermsManager{}
	handler = handler.WithTerms(terms)
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    "notos@example.com",
		"password": "TestPassword123!",
		"phone":    "9876500001",
		// terms_accepted omitted/false — nothing should be recorded; the
		// first-upload gate will prompt instead.
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	assert.Equal(t, 0, terms.calls, "no acceptance must be recorded when the box is unchecked")
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
	for _, plan := range []string{"free", "creator", "pro_photographer", "studio"} {
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

func TestRegisterHandler_PlanEliteStudioSelfServe(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    "elite@example.com",
		"password": "TestPassword123!",
		"phone":    "9000000004",
		"plan":     "elite_studio",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	var result map[string]any
	json.NewDecoder(resp.Body).Decode(&result)
	assert.Equal(t, "elite_studio", result["plan"])
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
		auth.OAuthConfig{ClientID: "test", ClientSecret: "test-secret", RedirectURI: "http://localhost/cb"},
		newMockProvider(nil), &mockUserStore{users: map[string]*auth.User{}},
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

func TestOAuthGoogle_StartSetsBrowserBoundStateCookie(t *testing.T) {
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

	assert.Equal(t, http.StatusFound, resp.StatusCode)
	var stateCookie *http.Cookie
	for _, cookie := range resp.Cookies() {
		if cookie.Name == "rawdrive_oauth_state" {
			stateCookie = cookie
			break
		}
	}
	require.NotNil(t, stateCookie, "OAuth start must bind state to a browser cookie")
	assert.True(t, stateCookie.HttpOnly)
	assert.Equal(t, http.SameSiteLaxMode, stateCookie.SameSite)
	assert.Equal(t, "/", stateCookie.Path)
	assert.NotEmpty(t, stateCookie.Value)
	assert.Contains(t, resp.Header.Get("Location"), "code_challenge=")
	assert.Contains(t, resp.Header.Get("Location"), "code_challenge_method=S256")
	assert.NotContains(t, resp.Header.Get("Location"), "code_verifier")
}

// TestOAuthGoogleStatus_EnabledWhenConfigured asserts the public status probe
// reports enabled==true when an OAuth service is wired (GOOGLE_CLIENT_* present).
// newOAuthHandler() constructs the handler WITH a non-nil oauth service, so the
// status endpoint should see h.oauth != nil. No network is touched —
// InitiateGoogleAuth is never called by the status endpoint (OBS-2).
func TestOAuthGoogleStatus_EnabledWhenConfigured(t *testing.T) {
	_, ts := newOAuthHandler()
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/auth/oauth/google/status")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result map[string]bool
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.True(t, result["enabled"], "status must report enabled when oauth is configured")
}

// TestOAuthGoogleStatus_DisabledWhenNil asserts the public status probe reports
// enabled==false when no OAuth service is wired (h.oauth == nil). setupAuthRouter
// builds the handler with nil oauth, matching an unconfigured deployment (OBS-2).
func TestOAuthGoogleStatus_DisabledWhenNil(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/auth/oauth/google/status")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result map[string]bool
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.False(t, result["enabled"], "status must report disabled when oauth is nil")
}

func TestOAuthGoogleStatus_DisabledWhenPartiallyConfigured(t *testing.T) {
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
	oauthSvc := auth.NewOAuthService(
		auth.OAuthConfig{ClientID: "test-client", RedirectURI: "http://localhost/callback"},
		newMockProvider(nil),
		&mockUserStore{users: map[string]*auth.User{}},
	)
	handler := auth.NewHandler(otpSvc, jwtSvc, oauthSvc, newMockUserService())
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/auth/oauth/google/status")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	var result map[string]bool
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.False(t, result["enabled"], "status must require client id, secret, redirect uri, provider, and store")
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
	accessCookie := accessCookieFromResponse(t, resp)
	assert.Equal(t, result["access_token"], accessCookie.Value)
	assert.True(t, accessCookie.HttpOnly)
	assert.Equal(t, http.SameSiteStrictMode, accessCookie.SameSite)
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

	oauthSvc := auth.NewOAuthService(
		auth.OAuthConfig{ClientID: "test-client", ClientSecret: "test-secret", RedirectURI: "http://localhost/callback"},
		newMockProvider(nil),
		&mockUserStore{users: map[string]*auth.User{}},
	)
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
		Email:         "oauth@example.com",
		EmailVerified: true,
		DisplayName:   "OAuth User",
		ProviderID:    "google-oauth-test",
	}
	oauthSvc, state, cookieValue := newAuthorizedService(t, newMockProvider(profile), &mockUserStore{users: map[string]*auth.User{}})
	handler := auth.NewHandler(otpSvc, jwtSvc, oauthSvc, newMockUserService())

	ts := newTestServer(handler)
	defer ts.Close()

	client := &http.Client{CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	// S1-G3: the callback requires the signed oauth_state cookie to match the
	// state, so the test must present the cookie the initiate step set.
	req, err := http.NewRequest(http.MethodGet, ts.URL+"/auth/oauth/google/callback?code=valid-code&state="+url.QueryEscape(state), nil)
	require.NoError(t, err)
	req.AddCookie(oauthStateCookie(cookieValue))
	resp, err := client.Do(req)
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

func TestOAuthGoogleCallback_MaxSessionsRedirectsToLoginError(t *testing.T) {
	t.Setenv("FRONTEND_URL", "http://localhost:3000")

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
		MaxSessions:        0,
	})

	profile := &auth.OAuthProfile{
		Email:         "oauth-limit@example.com",
		EmailVerified: true,
		DisplayName:   "OAuth Limit",
		ProviderID:    "google-oauth-limit",
	}
	oauthSvc, state, cookieValue := newAuthorizedService(t, newMockProvider(profile), &mockUserStore{users: map[string]*auth.User{}})
	handler := auth.NewHandler(otpSvc, jwtSvc, oauthSvc, newMockUserService())

	ts := newTestServer(handler)
	defer ts.Close()

	client := &http.Client{CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	req, err := http.NewRequest(http.MethodGet, ts.URL+"/auth/oauth/google/callback?code=valid-code&state="+url.QueryEscape(state), nil)
	require.NoError(t, err)
	req.AddCookie(oauthStateCookie(cookieValue))
	resp, err := client.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusFound, resp.StatusCode)
	location, err := url.Parse(resp.Header.Get("Location"))
	require.NoError(t, err)
	assert.Equal(t, "http", location.Scheme)
	assert.Equal(t, "localhost:3000", location.Host)
	assert.Equal(t, "/login", location.Path)
	assert.Equal(t, string(auth.OAuthErrTooManySessions), location.Query().Get("error"))
	assert.Nil(t, findCookie(resp.Cookies(), "refresh_token"), "no session cookie should be issued after the cap is hit")
	assert.NotContains(t, resp.Header.Get("Content-Type"), "application/json")
}

func TestOAuthGoogleCallback_ReplacesOldestSessionWhenCapReached(t *testing.T) {
	t.Setenv("FRONTEND_URL", "http://localhost:3000")

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
		MaxSessions:        1,
	})

	const userID = "oauth-session-recovery-user"
	const providerID = "google-oauth-session-recovery"
	oldRefresh, err := jwtSvc.GenerateRefreshTokenWithClaims(context.Background(), userID, "family-old", "pending-onboarding", "Owner", "photographer", "pending-onboarding")
	require.NoError(t, err)

	profile := &auth.OAuthProfile{
		Email:         "oauth-recovery@example.com",
		EmailVerified: true,
		DisplayName:   "OAuth Recovery",
		ProviderID:    providerID,
	}
	store := &mockUserStore{
		users: map[string]*auth.User{
			profile.Email: {ID: userID, Email: profile.Email, EmailVerified: true},
		},
		links: map[string]string{linkKey("google", providerID): userID},
	}
	oauthSvc, state, cookieValue := newAuthorizedService(t, newMockProvider(profile), store)
	handler := auth.NewHandler(otpSvc, jwtSvc, oauthSvc, newMockUserService())

	ts := newTestServer(handler)
	defer ts.Close()

	client := &http.Client{CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	req, err := http.NewRequest(http.MethodGet, ts.URL+"/auth/oauth/google/callback?code=valid-code&state="+url.QueryEscape(state), nil)
	require.NoError(t, err)
	req.AddCookie(oauthStateCookie(cookieValue))
	resp, err := client.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusFound, resp.StatusCode)
	location, err := url.Parse(resp.Header.Get("Location"))
	require.NoError(t, err)
	assert.Equal(t, "1", location.Query().Get("authenticated"))
	assert.Empty(t, location.Query().Get("error"))
	newRefresh := refreshCookieFromResponse(t, resp).Value
	require.NotEmpty(t, newRefresh)

	_, _, err = jwtSvc.RotateRefreshToken(context.Background(), oldRefresh)
	require.Error(t, err, "old session family should be revoked to make room for the OAuth session")
	_, _, err = jwtSvc.RotateRefreshToken(context.Background(), newRefresh)
	require.NoError(t, err, "new OAuth session should be usable")
}

func TestOAuthGoogleCallback_UnactivatedAccountRedirectIncludesActivationEmail(t *testing.T) {
	t.Setenv("FRONTEND_URL", "http://localhost:3000")

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

	email := "inactive@example.com"
	profile := &auth.OAuthProfile{
		Email:         email,
		EmailVerified: true,
		DisplayName:   "Inactive User",
		ProviderID:    "google-inactive",
	}
	store := &mockUserStore{users: map[string]*auth.User{
		email: {ID: "inactive-uuid", Email: email, EmailVerified: false},
	}}
	oauthSvc, state, cookieValue := newAuthorizedService(t, newMockProvider(profile), store)
	handler := auth.NewHandler(otpSvc, jwtSvc, oauthSvc, newMockUserService())

	ts := newTestServer(handler)
	defer ts.Close()

	client := &http.Client{CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	req, err := http.NewRequest(http.MethodGet, ts.URL+"/auth/oauth/google/callback?code=valid-code&state="+url.QueryEscape(state), nil)
	require.NoError(t, err)
	req.AddCookie(oauthStateCookie(cookieValue))
	resp, err := client.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusFound, resp.StatusCode)
	location, err := url.Parse(resp.Header.Get("Location"))
	require.NoError(t, err)
	assert.Equal(t, "http", location.Scheme)
	assert.Equal(t, "localhost:3000", location.Host)
	assert.Equal(t, "/login", location.Path)
	assert.Equal(t, string(auth.OAuthErrAccountNotActivated), location.Query().Get("error"))
	assert.Equal(t, email, location.Query().Get("email"))
}

func TestOAuthGoogleCallback_InvalidClientRedirectsConfigUnavailable(t *testing.T) {
	t.Setenv("FRONTEND_URL", "http://localhost:3000")

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
	provider := &mockOAuthProvider{
		exchangeFunc: func(code, codeVerifier string) (*auth.OAuthToken, error) {
			return nil, &auth.GoogleTokenError{StatusCode: http.StatusUnauthorized, Code: "invalid_client"}
		},
		profileFunc: func(token *auth.OAuthToken, expectedNonce string) (*auth.OAuthProfile, error) {
			t.Fatal("profile should not be fetched after invalid_client")
			return nil, nil
		},
	}
	oauthSvc, state, cookieValue := newAuthorizedService(t, provider, &mockUserStore{users: map[string]*auth.User{}})
	handler := auth.NewHandler(otpSvc, jwtSvc, oauthSvc, newMockUserService())

	ts := newTestServer(handler)
	defer ts.Close()

	client := &http.Client{CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	req, err := http.NewRequest(http.MethodGet, ts.URL+"/auth/oauth/google/callback?code=valid-code&state="+url.QueryEscape(state), nil)
	require.NoError(t, err)
	req.AddCookie(oauthStateCookie(cookieValue))
	resp, err := client.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusFound, resp.StatusCode)
	location := resp.Header.Get("Location")
	parsed, err := url.Parse(location)
	require.NoError(t, err)
	assert.Equal(t, "oauth_config_unavailable", parsed.Query().Get("error"))

	statusResp, err := http.Get(ts.URL + "/auth/oauth/google/status")
	require.NoError(t, err)
	defer statusResp.Body.Close()
	var status map[string]bool
	require.NoError(t, json.NewDecoder(statusResp.Body).Decode(&status))
	assert.False(t, status["enabled"])

	startResp, err := client.Get(ts.URL + "/auth/oauth/google?redirect_to=http%3A%2F%2Flocalhost%3A3000")
	require.NoError(t, err)
	defer startResp.Body.Close()
	assert.Equal(t, http.StatusFound, startResp.StatusCode)
	startLocation := startResp.Header.Get("Location")
	assert.NotContains(t, startLocation, "accounts.google.com")
	startURL, err := url.Parse(startLocation)
	require.NoError(t, err)
	assert.Equal(t, "http", startURL.Scheme)
	assert.Equal(t, "localhost:3000", startURL.Host)
	assert.Equal(t, "/login", startURL.Path)
	assert.Equal(t, "oauth_config_unavailable", startURL.Query().Get("error"))
	assert.Nil(t, findCookie(startResp.Cookies(), "rawdrive_oauth_state"))
}

func TestOAuthGoogleCallback_MFAStepUpUsesHttpOnlyCookie(t *testing.T) {
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
	userID := uuid.New()
	email := "oauth-mfa@example.com"
	profile := &auth.OAuthProfile{
		Email:         email,
		EmailVerified: true,
		DisplayName:   "OAuth MFA User",
		ProviderID:    "google-oauth-mfa",
	}
	store := &mockUserStore{users: map[string]*auth.User{
		email: {ID: userID.String(), Email: email, EmailVerified: true},
	}}
	oauthSvc, state, cookieValue := newAuthorizedService(t, newMockProvider(profile), store)
	mfaHandler := auth.NewMFAHandler(nil, nil, nil, nil, nil, jwtSvc, "", nil, nil)
	handler := auth.NewHandler(otpSvc, jwtSvc, oauthSvc, newMockUserService()).
		WithMFA(verifiedMFAEnrollmentStore{userID: userID}, mfaHandler)

	ts := newTestServer(handler)
	defer ts.Close()

	client := &http.Client{CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	req, err := http.NewRequest(http.MethodGet, ts.URL+"/auth/oauth/google/callback?code=valid-code&state="+url.QueryEscape(state), nil)
	require.NoError(t, err)
	req.AddCookie(oauthStateCookie(cookieValue))
	resp, err := client.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusFound, resp.StatusCode)
	location := resp.Header.Get("Location")
	parsed, err := url.Parse(location)
	require.NoError(t, err)
	assert.Equal(t, "1", parsed.Query().Get("mfa_required"))
	assert.Equal(t, "totp", parsed.Query().Get("challenge"))
	assert.Empty(t, parsed.Query().Get("mfa_token"))
	assert.NotContains(t, location, "mfa_token=")
	assert.Nil(t, findCookie(resp.Cookies(), "refresh_token"), "full session must not be issued before MFA")

	challengeCookie := findCookie(resp.Cookies(), "rawdrive_mfa_challenge")
	require.NotNil(t, challengeCookie)
	assert.True(t, challengeCookie.HttpOnly)
	assert.Equal(t, http.SameSiteStrictMode, challengeCookie.SameSite)
	assert.Equal(t, "/auth", challengeCookie.Path)
	assert.Greater(t, challengeCookie.MaxAge, 0)
	assert.NotEmpty(t, challengeCookie.Value)
}

func TestOAuthGoogleRejectsExternalRedirectTo(t *testing.T) {
	t.Setenv("FRONTEND_URL", "http://localhost:3000")

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
		Email:         "safe-redirect@example.com",
		EmailVerified: true,
		DisplayName:   "Safe Redirect",
		ProviderID:    "google-safe-redirect",
	}
	oauthSvc := auth.NewOAuthService(
		auth.OAuthConfig{ClientID: "test-client", ClientSecret: "test-secret", RedirectURI: "http://localhost/callback"},
		newMockProvider(profile),
		&mockUserStore{users: map[string]*auth.User{}},
	)
	handler := auth.NewHandler(otpSvc, jwtSvc, oauthSvc, newMockUserService())

	ts := newTestServer(handler)
	defer ts.Close()

	client := &http.Client{CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	startResp, err := client.Get(ts.URL + "/auth/oauth/google?redirect_to=https%3A%2F%2Fevil.example")
	require.NoError(t, err)
	defer startResp.Body.Close()
	require.Equal(t, http.StatusFound, startResp.StatusCode)
	stateURL, err := url.Parse(startResp.Header.Get("Location"))
	require.NoError(t, err)
	state := stateURL.Query().Get("state")
	require.NotEmpty(t, state)
	stateCookie := findCookie(startResp.Cookies(), "rawdrive_oauth_state")
	require.NotNil(t, stateCookie)

	req, err := http.NewRequest(http.MethodGet, ts.URL+"/auth/oauth/google/callback?code=valid-code&state="+url.QueryEscape(state), nil)
	require.NoError(t, err)
	req.AddCookie(oauthStateCookie(stateCookie.Value))
	resp, err := client.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	location := resp.Header.Get("Location")
	assert.NotContains(t, location, "evil.example")
	assert.True(t, strings.HasPrefix(location, "http://localhost:3000/login?"), location)
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
	assert.Equal(t, result["access_token"], accessCookieFromResponse(t, resp).Value)
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

// TestRefreshTokenHandler_NoTokenReturnsQuietNoContent asserts OBS-1: a probe
// with NO refresh credential at all (no cookie, no body) is the normal state
// for a logged-out visitor whose SPA pings /auth/refresh on mount. The handler
// answers 204 (with an empty body) so the browser console/network panel does
// not flag a red 4xx on every public page load. A *present but invalid* token
// still returns 401 (see TestRefreshTokenHandler_InvalidToken).
func TestRefreshTokenHandler_NoTokenReturnsQuietNoContent(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()

	ts := newTestServer(handler)
	defer ts.Close()

	req, err := http.NewRequest(http.MethodPost, ts.URL+"/auth/refresh", nil)
	require.NoError(t, err)
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNoContent, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Empty(t, body, "204 no-session response must have an empty body")
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
	assert.Equal(t, -1, accessCookieFromResponse(t, resp).MaxAge)
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

func TestRefreshToken_ReresolvesPlatformRoleChange(t *testing.T) {
	jwtSvc := auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
		MaxSessions:        5,
	})

	refreshToken, err := jwtSvc.GenerateRefreshTokenWithMFA(
		context.Background(),
		"00000000-0000-0000-0000-000000000002",
		"family-role-refresh",
		"11111111-1111-1111-1111-111111111111",
		"Owner",
		"photographer",
		"state-1",
		true,
	)
	require.NoError(t, err)

	handler := auth.NewHandler(nil, jwtSvc, nil, nil).
		WithWorkspaceLookup(stubWorkspaceLookup{
			wsID:         "11111111-1111-1111-1111-111111111111",
			stateID:      "state-1",
			role:         "Owner",
			platformRole: "super_admin",
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

	claims, err := jwtSvc.ParseAccessToken(context.Background(), result["access_token"])
	require.NoError(t, err)
	assert.Equal(t, "super_admin", claims.PlatformRole)
	assert.Equal(t, "11111111-1111-1111-1111-111111111111", claims.WorkspaceID)
	assert.True(t, claims.MFAVerified)
}

// ─────────────────────────── F-056: max password length at registration ───────────────────────────

// TestRegisterHandler_RejectsOverlongPassword is the F-056 regression. Before
// the fix Register only enforced a MINIMUM length, so a password longer than
// bcrypt's 72-byte truncation boundary was accepted and silently weakened
// (or, in current x/crypto/bcrypt, rejected by the hashing library). Register must
// now reject anything over the 72-byte cap with a 400 before it ever reaches
// the downstream hashing site in h.users.Create.
func TestRegisterHandler_RejectsOverlongPassword(t *testing.T) {
	handler, _, _, userSvc := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	// 73 bytes — one over bcrypt's byte limit.
	longPassword := "Aa1!" + strings.Repeat("x", 69)
	require.Len(t, longPassword, 73)

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    "toolong@example.com",
		"password": longPassword,
		"phone":    "9000000005",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode,
		"F-056: password longer than 72 bytes must be rejected, not hashed")

	var body map[string]string
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "at most")

	// The over-long password must never have reached the user store.
	_, exists, _ := userSvc.FindByEmail(context.Background(), "toolong@example.com")
	assert.False(t, exists, "no user should be created when the password is rejected")
}

// TestRegisterHandler_AcceptsBoundaryLengthPassword guards the cap boundary:
// a password of exactly 72 bytes is still accepted, so the F-056 fix does not
// over-correct and lock out legitimate long passphrases.
func TestRegisterHandler_AcceptsBoundaryLengthPassword(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	boundaryPassword := "Aa1!" + strings.Repeat("x", 68)
	require.Len(t, boundaryPassword, 72)

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    "boundary@example.com",
		"password": boundaryPassword,
		"phone":    "9000000006",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode,
		"a 72-byte password is exactly at the cap and must still register")
}

// TestRegisterHandler_RejectsShortPassword pins the unified 12-char minimum
// (public-pages review 2026-06-04, P0 #3). Registration previously accepted
// 8-char passwords while password reset required 12; an 11-char password must
// now be rejected so both flows share one floor. Existing register tests use a
// 16-char password and are unaffected.
func TestRegisterHandler_RejectsShortPassword(t *testing.T) {
	handler, _, _, _ := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	shortPassword := "StrongP@ss1" // 11 chars — exactly one under the floor
	require.Len(t, shortPassword, 11)

	resp, err := postJSON(ts.URL+"/auth/register", map[string]any{
		"email":    "shortpw@example.com",
		"password": shortPassword,
		"phone":    "9000000007",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode,
		"an 11-char password is below the 12-char minimum and must be rejected")
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
