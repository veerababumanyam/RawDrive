package onboarding_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/middleware"
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

// failingWorkspaceCreator always returns an error. Used to assert the
// v0.0.47 fix: a failed workspace must NOT advance the onboarding step,
// so the user can retry from step=profile instead of being trapped with
// "onboarding complete ✓" and no workspace.
type failingWorkspaceCreator struct {
	attempts int
}

func (f *failingWorkspaceCreator) CreateWorkspace(_ context.Context, _, _, _ string) (string, error) {
	f.attempts++
	return "", errors.New("simulated DB outage")
}

type stubEventPub struct {
	events []string
}

func (s *stubEventPub) Publish(_ context.Context, subject string, _ []byte) error {
	s.events = append(s.events, subject)
	return nil
}

// stubOnboardingRepo is an in-memory Repository for tests. It mirrors
// the behavior of the pgx PgRepo minus the SQL, so service-layer tests
// run without a live database. Concurrency is unprotected on purpose —
// tests are single-threaded.
type stubOnboardingRepo struct {
	rows       map[string]*onboarding.StatusRecord
	resolveMap map[string]int // maps any legal identifier → canonical id
}

func newStubOnboardingRepo() *stubOnboardingRepo {
	return &stubOnboardingRepo{
		rows: map[string]*onboarding.StatusRecord{},
		// Minimal lookup table covering the identifiers used in tests.
		// Anything not in this map is treated as ErrInvalidState.
		resolveMap: map[string]int{
			"MH":          14,
			"14":          14,
			"Maharashtra": 14,
			"IN-MH":       14,
			"KA":          11,
			"11":          11,
			"Karnataka":   11,
		},
	}
}

func (s *stubOnboardingRepo) Get(_ context.Context, userID string) (*onboarding.StatusRecord, error) {
	if rec, ok := s.rows[userID]; ok {
		// Return a copy so tests that mutate return values don't
		// corrupt the stored row.
		cp := *rec
		return &cp, nil
	}
	return nil, nil
}

func (s *stubOnboardingRepo) Upsert(_ context.Context, rec *onboarding.StatusRecord) error {
	existing, ok := s.rows[rec.UserID]
	if !ok {
		cp := *rec
		s.rows[rec.UserID] = &cp
		return nil
	}
	// COALESCE semantics: nil/empty-string fields do not overwrite.
	existing.CurrentStep = rec.CurrentStep
	if rec.StateID != nil {
		existing.StateID = rec.StateID
	}
	if rec.BusinessName != "" {
		existing.BusinessName = rec.BusinessName
	}
	if rec.DisplayName != "" {
		existing.DisplayName = rec.DisplayName
	}
	if rec.GSTIN != "" {
		existing.GSTIN = rec.GSTIN
	}
	return nil
}

func (s *stubOnboardingRepo) ResolveStateID(_ context.Context, raw string) (int, error) {
	if id, ok := s.resolveMap[raw]; ok {
		return id, nil
	}
	return 0, onboarding.ErrInvalidState
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

// authInjectServer wraps the handler to inject JWT claims into context
// using the canonical middleware.WithJWTClaims so the handler can find them.
func authInjectServer(svc onboarding.Service, userID string) *httptest.Server {
	handler := onboarding.NewHandler(svc)
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := middleware.WithJWTClaims(r.Context(), map[string]interface{}{
				"sub":          userID,
				"workspace_id": "test-ws",
				"role":         "Owner",
				"state_id":     "1",
			})
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
	repo := newStubOnboardingRepo()
	svc := onboarding.NewService(repo, wsc, pub)

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
	repo := newStubOnboardingRepo()
	svc := onboarding.NewService(repo, wsc, pub)

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
	repo := newStubOnboardingRepo()
	svc := onboarding.NewService(repo, wsc, pub)

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
	repo := newStubOnboardingRepo()
	svc := onboarding.NewService(repo, wsc, pub)

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
	repo := newStubOnboardingRepo()
	svc := onboarding.NewService(repo, wsc, pub)

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
	repo := newStubOnboardingRepo()
	svc := onboarding.NewService(repo, wsc, pub)

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
	// State is now serialized as the canonical integer id as text,
	// not the 2-letter code the user originally sent. Karnataka is 11
	// per the stub resolver (matching migration 010 seed data).
	assert.Equal(t, "11", status.StateID)
}

// TestStateSelectionHandler_NumericStateID asserts that the new
// /register → /onboarding bridge works end-to-end: a numeric state_id
// (as sent by the post-v0.0.47 RegisterForm via /api/v1/states) is
// accepted and canonicalized. Previously only 2-letter codes were
// accepted, which silently broke the new signup flow.
func TestStateSelectionHandler_NumericStateID(t *testing.T) {
	wsc := &stubWorkspaceCreator{}
	pub := &stubEventPub{}
	repo := newStubOnboardingRepo()
	svc := onboarding.NewService(repo, wsc, pub)

	ts := authInjectServer(svc, "user-numeric")
	defer ts.Close()

	// Note: json number, not quoted — exercises the json.RawMessage path.
	body := bytes.NewReader([]byte(`{"state_id": 14}`))
	req, _ := http.NewRequest("POST", ts.URL+"/onboarding/state", body)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	// Verify persistence: the repo should now have the row with StateID=14
	// and step advanced to profile.
	rec, _ := repo.Get(context.Background(), "user-numeric")
	require.NotNil(t, rec)
	require.NotNil(t, rec.StateID)
	assert.Equal(t, 14, *rec.StateID)
	assert.Equal(t, onboarding.StepProfile, rec.CurrentStep)
}

// TestOnboardingPersistsAcrossServiceInstances asserts the core property
// that motivated migration 067: a second Service instance (simulating
// a process restart) can see the state written by the first. Before
// the fix, the in-memory map was per-process so this test would fail.
func TestOnboardingPersistsAcrossServiceInstances(t *testing.T) {
	repo := newStubOnboardingRepo()

	// First "process": select state.
	svc1 := onboarding.NewService(repo, &stubWorkspaceCreator{}, &stubEventPub{})
	err := svc1.SelectState(context.Background(), "user-restart",
		onboarding.StateSelectionInput{StateID: "Maharashtra"})
	require.NoError(t, err)

	// Second "process": new Service, SAME repo. Should see the row.
	svc2 := onboarding.NewService(repo, &stubWorkspaceCreator{}, &stubEventPub{})
	status, err := svc2.GetStatus(context.Background(), "user-restart")
	require.NoError(t, err)
	assert.Equal(t, onboarding.StepProfile, status.CurrentStep)
	assert.Equal(t, "14", status.StateID)
}

// TestSetProfile_WorkspaceFailureDoesNotAdvanceStep is the regression
// test for v0.0.47's silent-failure fix. Before the fix, SetProfile
// upserted step=complete FIRST and then ignored the CreateWorkspace
// error, leaving users with "onboarding complete ✓" on screen but no
// workspace. The fix reorders so that a failed workspace leaves the
// user at step=profile for retry. This test asserts:
//
//  1. The service returns ErrWorkspaceCreateFail (wrapped), so the
//     handler can map it to HTTP 503.
//  2. The onboarding_statuses row is STILL at step=profile after the
//     failed call — no ghost "complete" status.
//  3. A subsequent successful retry (with a healthy workspace creator)
//     advances the step to complete. This proves retries are not
//     permanently broken by the failed attempt.
func TestSetProfile_WorkspaceFailureDoesNotAdvanceStep(t *testing.T) {
	repo := newStubOnboardingRepo()
	badWsc := &failingWorkspaceCreator{}
	pub := &stubEventPub{}
	svc := onboarding.NewService(repo, badWsc, pub)

	ctx := context.Background()

	// Arrange: user has completed state selection, step is "profile".
	require.NoError(t, svc.SelectState(ctx, "user-retry",
		onboarding.StateSelectionInput{StateID: "MH"}))

	// Act: SetProfile with a workspace creator that always errors.
	err := svc.SetProfile(ctx, "user-retry", onboarding.ProfileInput{
		BusinessName: "Retry Studios",
		DisplayName:  "Test Owner",
		GSTIN:        "", // empty = skip GSTIN validation
	})

	// Assert 1: error surfaces as ErrWorkspaceCreateFail.
	require.Error(t, err)
	assert.True(t, errors.Is(err, onboarding.ErrWorkspaceCreateFail),
		"expected ErrWorkspaceCreateFail, got %v", err)
	assert.Equal(t, 1, badWsc.attempts, "workspace creator should have been called once")

	// Assert 2: step is STILL profile, NOT complete. This is the core
	// invariant — a failed workspace must not leave the user trapped
	// with a ghost complete status.
	rec, err := repo.Get(ctx, "user-retry")
	require.NoError(t, err)
	require.NotNil(t, rec)
	assert.Equal(t, onboarding.StepProfile, rec.CurrentStep,
		"step must NOT advance to complete when workspace creation fails")

	// Assert 3: retry with a healthy creator completes normally.
	// We have to build a new service because the creator is injected
	// at construction time. Same repo so the prior state is preserved.
	goodWsc := &stubWorkspaceCreator{}
	svc2 := onboarding.NewService(repo, goodWsc, pub)
	require.NoError(t, svc2.SetProfile(ctx, "user-retry", onboarding.ProfileInput{
		BusinessName: "Retry Studios",
		DisplayName:  "Test Owner",
	}))

	rec, _ = repo.Get(ctx, "user-retry")
	require.NotNil(t, rec)
	assert.Equal(t, onboarding.StepComplete, rec.CurrentStep,
		"retry with healthy workspace creator should advance to complete")
	assert.Contains(t, goodWsc.created, "user-retry",
		"healthy retry should have created the workspace")
	assert.Contains(t, pub.events, "onboarding.complete",
		"completion event should fire after successful retry")
}

// TestSetProfile_CompletedStepIsIdempotent asserts the idempotent
// short-circuit: a SetProfile call for a user already at step=complete
// returns nil without attempting to re-create the workspace. Prevents
// duplicate workspace attempts if the client accidentally double-submits.
func TestSetProfile_CompletedStepIsIdempotent(t *testing.T) {
	repo := newStubOnboardingRepo()
	wsc := &stubWorkspaceCreator{}
	svc := onboarding.NewService(repo, wsc, &stubEventPub{})
	ctx := context.Background()

	// Drive the user through a full successful onboarding.
	require.NoError(t, svc.SelectState(ctx, "user-idem",
		onboarding.StateSelectionInput{StateID: "MH"}))
	require.NoError(t, svc.SetProfile(ctx, "user-idem", onboarding.ProfileInput{
		BusinessName: "Idempotent Co",
		DisplayName:  "Test",
	}))
	assert.Equal(t, 1, len(wsc.created), "first call should create workspace")

	// Double-submit: same call again. Must be a no-op success.
	err := svc.SetProfile(ctx, "user-idem", onboarding.ProfileInput{
		BusinessName: "Idempotent Co",
		DisplayName:  "Test",
	})
	require.NoError(t, err)
	assert.Equal(t, 1, len(wsc.created),
		"idempotent short-circuit should skip re-creating the workspace")
}
