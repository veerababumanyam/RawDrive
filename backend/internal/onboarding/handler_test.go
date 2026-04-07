package onboarding_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/onboarding"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ──────────────────────────── Stubs ────────────────────────────

type stubWorkspaceCreator struct {
	created []string
}

func (s *stubWorkspaceCreator) CreateWorkspace(_ context.Context, userID, stateID, businessName string) (string, error) {
	s.created = append(s.created, userID)
	return "ws-" + userID, nil
}

type stubEventPub struct {
	events []string
}

func (s *stubEventPub) Publish(_ context.Context, subject string, _ []byte) error {
	s.events = append(s.events, subject)
	return nil
}

// ──────────────────────────── Helpers ────────────────────────────

// Use plain string key so it matches the handler's fallback lookup.

func newOnboardingTestServer(svc onboarding.Service) *httptest.Server {
	handler := onboarding.NewHandler(svc)
	r := chi.NewRouter()
	r.Mount("/onboarding", handler.Routes())
	return httptest.NewServer(r)
}

func postJSONWithAuth(url, userID string, body interface{}) (*http.Response, error) {
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", url, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	// Set user_id in context by wrapping the request through a middleware test server
	// For simplicity, we'll use a custom test server that injects context
	return http.DefaultClient.Do(req)
}

// authInjectServer wraps the handler to inject user_id into context.
func authInjectServer(svc onboarding.Service, userID string) *httptest.Server {
	handler := onboarding.NewHandler(svc)
	r := chi.NewRouter()
	// Inject JWT claims into context
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), "user_id", userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Mount("/onboarding", handler.Routes())
	return httptest.NewServer(r)
}

func postJSON(url string, body interface{}) (*http.Response, error) {
	b, _ := json.Marshal(body)
	return http.Post(url, "application/json", bytes.NewReader(b))
}

func getJSON(url string) (*http.Response, error) {
	return http.Get(url)
}

// ──────────────────────────── Tests ────────────────────────────

func TestStateSelectionHandler_Success(t *testing.T) {
	wsc := &stubWorkspaceCreator{}
	pub := &stubEventPub{}
	svc := onboarding.NewService(wsc, pub)

	ts := authInjectServer(svc, "user-1")
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/onboarding/state", map[string]string{
		"state_id": "MH",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestStateSelectionHandler_InvalidState(t *testing.T) {
	wsc := &stubWorkspaceCreator{}
	pub := &stubEventPub{}
	svc := onboarding.NewService(wsc, pub)

	ts := authInjectServer(svc, "user-1")
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/onboarding/state", map[string]string{
		"state_id": "INVALID",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestStateSelectionHandler_MissingAuth(t *testing.T) {
	wsc := &stubWorkspaceCreator{}
	pub := &stubEventPub{}
	svc := onboarding.NewService(wsc, pub)

	// Use a server WITHOUT auth injection
	ts := newOnboardingTestServer(svc)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/onboarding/state", map[string]string{
		"state_id": "MH",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestProfileHandler_Success(t *testing.T) {
	wsc := &stubWorkspaceCreator{}
	pub := &stubEventPub{}
	svc := onboarding.NewService(wsc, pub)

	// First complete state selection
	err := svc.SelectState(context.Background(), "user-1", onboarding.StateSelectionInput{StateID: "MH"})
	require.NoError(t, err)

	ts := authInjectServer(svc, "user-1")
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/onboarding/profile", map[string]string{
		"business_name": "Test Corp",
		"gstin":         "27AABCU9603R1ZM",
		"display_name":  "Test User",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestProfileHandler_InvalidGSTIN(t *testing.T) {
	wsc := &stubWorkspaceCreator{}
	pub := &stubEventPub{}
	svc := onboarding.NewService(wsc, pub)

	// First complete state selection
	err := svc.SelectState(context.Background(), "user-1", onboarding.StateSelectionInput{StateID: "MH"})
	require.NoError(t, err)

	ts := authInjectServer(svc, "user-1")
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/onboarding/profile", map[string]string{
		"business_name": "Test Corp",
		"gstin":         "INVALID",
		"display_name":  "Test User",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestProfileHandler_Resume(t *testing.T) {
	wsc := &stubWorkspaceCreator{}
	pub := &stubEventPub{}
	svc := onboarding.NewService(wsc, pub)

	// Complete state selection so step advances to profile
	err := svc.SelectState(context.Background(), "user-1", onboarding.StateSelectionInput{StateID: "KA"})
	require.NoError(t, err)

	ts := authInjectServer(svc, "user-1")
	defer ts.Close()

	resp, err := getJSON(ts.URL + "/onboarding/status")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var status onboarding.OnboardingStatus
	json.NewDecoder(resp.Body).Decode(&status)
	assert.Equal(t, onboarding.StepProfile, status.CurrentStep)
	assert.Equal(t, "KA", status.StateID)
}
