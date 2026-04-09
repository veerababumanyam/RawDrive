package integration_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/onboarding"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ──────────────────────────── Onboarding Stubs ────────────────────────────

type onbWorkspaceCreator struct {
	created []struct{ UserID, StateID, BusinessName string }
}

func (o *onbWorkspaceCreator) CreateWorkspace(_ context.Context, userID, stateID, businessName string) (string, error) {
	o.created = append(o.created, struct{ UserID, StateID, BusinessName string }{userID, stateID, businessName})
	return "ws-" + userID, nil
}

type onbEventPub struct {
	events []string
}

func (o *onbEventPub) Publish(_ context.Context, subject string, _ []byte) error {
	o.events = append(o.events, subject)
	return nil
}

// Use plain string key so it matches the handler's fallback lookup.

func setupOnboardingServer(wsc *onbWorkspaceCreator, pub *onbEventPub, userID string) (*httptest.Server, onboarding.Service) {
	svc := onboarding.NewService(wsc, pub)
	handler := onboarding.NewHandler(svc)

	r := chi.NewRouter()
	// Inject user_id context
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := middleware.WithJWTClaims(r.Context(), map[string]interface{}{"sub": userID})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Mount("/onboarding", handler.Routes())
	return httptest.NewServer(r), svc
}

// ──────────────────────────── Tests ────────────────────────────

func TestFullOnboardingFlow(t *testing.T) {
	wsc := &onbWorkspaceCreator{}
	pub := &onbEventPub{}
	ts, _ := setupOnboardingServer(wsc, pub, "user-onb-1")
	defer ts.Close()

	// Step 1: Select state
	resp, err := postJSON(ts.URL+"/onboarding/state", map[string]string{
		"state_id": "MH",
	})
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	resp.Body.Close()

	// Step 2: Set profile
	resp, err = postJSON(ts.URL+"/onboarding/profile", map[string]string{
		"business_name": "Test Corp",
		"gstin":         "27AABCU9603R1ZM",
		"display_name":  "Test User",
	})
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	resp.Body.Close()

	// Verify workspace was auto-created
	assert.Len(t, wsc.created, 1)
	assert.Equal(t, "user-onb-1", wsc.created[0].UserID)

	// Verify welcome event was published
	assert.Contains(t, pub.events, "onboarding.complete")
}

func TestOnboardingResume(t *testing.T) {
	wsc := &onbWorkspaceCreator{}
	pub := &onbEventPub{}
	ts, svc := setupOnboardingServer(wsc, pub, "user-resume")
	defer ts.Close()

	// Partially onboard: just select state
	err := svc.SelectState(context.Background(), "user-resume", onboarding.StateSelectionInput{StateID: "KA"})
	require.NoError(t, err)

	// "Close browser" and come back - check status
	resp, err := http.Get(ts.URL + "/onboarding/status")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var status onboarding.OnboardingStatus
	json.NewDecoder(resp.Body).Decode(&status)
	resp.Body.Close()

	assert.Equal(t, onboarding.StepProfile, status.CurrentStep)
	assert.Equal(t, "KA", status.StateID)
}

func TestOnboardingSkipProtection(t *testing.T) {
	wsc := &onbWorkspaceCreator{}
	pub := &onbEventPub{}
	ts, _ := setupOnboardingServer(wsc, pub, "user-skip")
	defer ts.Close()

	// Try to set profile without selecting state first
	resp, err := postJSON(ts.URL+"/onboarding/profile", map[string]string{
		"business_name": "Skip Corp",
		"gstin":         "27AABCU9603R1ZM",
		"display_name":  "Skip User",
	})
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	resp.Body.Close()

	// Verify no workspace was created
	assert.Len(t, wsc.created, 0)
}

func TestOnboardingFunnelComplete(t *testing.T) {
	wsc := &onbWorkspaceCreator{}
	pub := &onbEventPub{}
	ts, _ := setupOnboardingServer(wsc, pub, "user-funnel")
	defer ts.Close()

	// Step 1: State
	resp, err := postJSON(ts.URL+"/onboarding/state", map[string]string{
		"state_id": "DL",
	})
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	resp.Body.Close()

	// Step 2: Profile
	resp, err = postJSON(ts.URL+"/onboarding/profile", map[string]string{
		"business_name": "Funnel Corp",
		"gstin":         "07AABCU9603R1ZM",
		"display_name":  "Funnel User",
	})
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	resp.Body.Close()

	// Verify all steps completed
	resp, err = http.Get(ts.URL + "/onboarding/status")
	require.NoError(t, err)

	var status onboarding.OnboardingStatus
	json.NewDecoder(resp.Body).Decode(&status)
	resp.Body.Close()

	assert.Equal(t, onboarding.StepComplete, status.CurrentStep)

	// Verify workspace was created
	assert.Len(t, wsc.created, 1)

	// Verify welcome event
	assert.Contains(t, pub.events, "onboarding.complete")
}
