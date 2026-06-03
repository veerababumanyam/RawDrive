package workspace_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/workspace"
)

// ──────────────────────────── Mock Service ────────────────────────────

type mockWorkspaceService struct {
	workspaces         map[string]*workspace.Workspace
	lastBootstrapQuota int64
}

func newMockWorkspaceService() *mockWorkspaceService {
	return &mockWorkspaceService{workspaces: make(map[string]*workspace.Workspace)}
}

func (m *mockWorkspaceService) Create(_ context.Context, input workspace.CreateWorkspaceInput) (*workspace.Workspace, error) {
	ws := &workspace.Workspace{
		ID:           "ws-new-123",
		Name:         input.Name,
		StateID:      input.StateID,
		OwnerID:      input.OwnerID,
		BusinessName: input.BusinessName,
	}
	m.workspaces[ws.ID] = ws
	return ws, nil
}

// CreateWithBootstrap records the resolved quota so tests can confirm the
// handler routed creation through the atomic co-create path with a valid
// (free-tier) quota rather than the legacy storage-less Create.
func (m *mockWorkspaceService) CreateWithBootstrap(_ context.Context, input workspace.CreateWorkspaceInput, quotaBytes int64) (*workspace.Workspace, error) {
	ws := &workspace.Workspace{
		ID:           "ws-new-123",
		Name:         input.Name,
		StateID:      input.StateID,
		OwnerID:      input.OwnerID,
		BusinessName: input.BusinessName,
	}
	m.workspaces[ws.ID] = ws
	m.lastBootstrapQuota = quotaBytes
	return ws, nil
}

func (m *mockWorkspaceService) GetByID(_ context.Context, id string) (*workspace.Workspace, error) {
	ws, ok := m.workspaces[id]
	if !ok {
		return nil, workspace.ErrNotFound
	}
	return ws, nil
}

// GetByOwnerAndName satisfies the Service interface added for Issue #5.
// The mock has no real index so this is a linear scan over the seeded
// workspaces; sufficient for handler-tier tests that do not exercise
// the duplicate-recovery path directly.
func (m *mockWorkspaceService) GetByOwnerAndName(_ context.Context, ownerID, name string) (*workspace.Workspace, error) {
	for _, ws := range m.workspaces {
		if ws.OwnerID == ownerID && strings.EqualFold(ws.Name, name) {
			return ws, nil
		}
	}
	return nil, workspace.ErrNotFound
}

// ──────────────────────────── Helpers ────────────────────────────

// Use plain string key so it matches the handler's fallback lookup.

func newWSTestServer(svc workspace.Service, claims map[string]interface{}) *httptest.Server {
	handler := workspace.NewHandler(svc)
	r := chi.NewRouter()
	if claims != nil {
		r.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				ctx := middleware.WithJWTClaims(r.Context(), claims)
				next.ServeHTTP(w, r.WithContext(ctx))
			})
		})
	}
	r.Mount("/workspace", handler.Routes())
	return httptest.NewServer(r)
}

func postJSON(url string, body interface{}) (*http.Response, error) {
	b, _ := json.Marshal(body)
	return http.Post(url, "application/json", bytes.NewReader(b))
}

// ──────────────────────────── Tests ────────────────────────────

func TestCreateWorkspaceHandler_Success(t *testing.T) {
	svc := newMockWorkspaceService()
	claims := map[string]interface{}{
		"sub":          "user-1",
		"workspace_id": "ws-default",
		"state_id":     "24", // numeric state id (onboarded user)
		"role":         "Owner",
	}

	ts := newWSTestServer(svc, claims)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/workspace/", map[string]string{
		"name":          "My Workspace",
		"business_name": "TestCo",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	assert.NotEmpty(t, result["id"])
	assert.Equal(t, "My Workspace", result["name"])

	// AREA-CUSTOMER-1: creation must route through the atomic co-create
	// path (CreateWithBootstrap), not the legacy storage-less Create. The
	// free-tier default quota (1 GiB) must be passed.
	assert.Equal(t, int64(1<<30), svc.lastBootstrapQuota,
		"handler must co-create the storage quota row via CreateWithBootstrap")
}

// AREA-CUSTOMER-2: an un-onboarded session carries state_id="pending-onboarding".
// The workspaces.state_id column is INTEGER, so the handler must reject this
// with 400 BEFORE any DB insert — never garbage the INT column.
func TestCreateWorkspaceHandler_PendingOnboardingSentinel(t *testing.T) {
	svc := newMockWorkspaceService()
	claims := map[string]interface{}{
		"sub":          "user-1",
		"workspace_id": "pending-onboarding",
		"state_id":     "pending-onboarding",
		"role":         "Owner",
	}

	ts := newWSTestServer(svc, claims)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/workspace/", map[string]string{
		"name":          "My Workspace",
		"business_name": "TestCo",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode,
		"pending-onboarding sentinel must be rejected with 400, not inserted")
	assert.Empty(t, svc.workspaces, "no workspace may be created for a pending-onboarding session")
}

// AREA-CUSTOMER-2: any non-numeric state_id (the column is INTEGER) must be
// rejected with 400 rather than attempting a corrupt insert.
func TestCreateWorkspaceHandler_NonNumericState(t *testing.T) {
	svc := newMockWorkspaceService()
	claims := map[string]interface{}{
		"sub":          "user-1",
		"workspace_id": "ws-default",
		"state_id":     "MH", // 2-letter code is NOT a valid INT state id
		"role":         "Owner",
	}

	ts := newWSTestServer(svc, claims)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/workspace/", map[string]string{
		"name":          "My Workspace",
		"business_name": "TestCo",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode,
		"non-numeric state_id must be rejected with 400")
	assert.Empty(t, svc.workspaces)
}

func TestCreateWorkspaceHandler_NoAuth(t *testing.T) {
	svc := newMockWorkspaceService()

	ts := newWSTestServer(svc, nil) // no claims
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/workspace/", map[string]string{
		"name": "My Workspace",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestGetWorkspaceHandler_Success(t *testing.T) {
	svc := newMockWorkspaceService()
	svc.workspaces["ws-123"] = &workspace.Workspace{
		ID:           "ws-123",
		Name:         "Test WS",
		StateID:      "MH",
		OwnerID:      "user-1",
		BusinessName: "TestCo",
	}

	claims := map[string]interface{}{
		"sub":          "user-1",
		"workspace_id": "ws-123",
		"state_id":     "MH",
		"role":         "Owner",
	}

	ts := newWSTestServer(svc, claims)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/workspace/ws-123")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	assert.Equal(t, "ws-123", result["id"])
}

func TestGetWorkspaceHandler_CrossTenant(t *testing.T) {
	svc := newMockWorkspaceService()
	svc.workspaces["ws-other"] = &workspace.Workspace{
		ID: "ws-other", Name: "Other WS",
	}

	claims := map[string]interface{}{
		"sub":          "user-1",
		"workspace_id": "ws-mine",
		"state_id":     "MH",
		"role":         "Owner",
	}

	ts := newWSTestServer(svc, claims)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/workspace/ws-other")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestGetWorkspaceHandler_NotFound(t *testing.T) {
	svc := newMockWorkspaceService()

	claims := map[string]interface{}{
		"sub":          "user-1",
		"workspace_id": "ws-missing",
		"state_id":     "MH",
		"role":         "Owner",
	}

	ts := newWSTestServer(svc, claims)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/workspace/ws-missing")
	require.NoError(t, err)
	defer resp.Body.Close()

	// The workspace_id in claims matches the URL param, so no cross-tenant block,
	// but the workspace doesn't exist in the mock.
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// Verify that the handler correctly handles service errors.
func TestGetWorkspaceHandler_InternalError(t *testing.T) {
	svc := &errorWorkspaceService{}
	claims := map[string]interface{}{
		"sub":          "user-1",
		"workspace_id": "ws-err",
		"state_id":     "MH",
		"role":         "Owner",
	}

	ts := newWSTestServer(svc, claims)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/workspace/ws-err")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}

type errorWorkspaceService struct{}

func (e *errorWorkspaceService) Create(_ context.Context, _ workspace.CreateWorkspaceInput) (*workspace.Workspace, error) {
	return nil, errors.New("db error")
}

func (e *errorWorkspaceService) CreateWithBootstrap(_ context.Context, _ workspace.CreateWorkspaceInput, _ int64) (*workspace.Workspace, error) {
	return nil, errors.New("db error")
}

func (e *errorWorkspaceService) GetByID(_ context.Context, _ string) (*workspace.Workspace, error) {
	return nil, errors.New("db error")
}

func (e *errorWorkspaceService) GetByOwnerAndName(_ context.Context, _, _ string) (*workspace.Workspace, error) {
	return nil, errors.New("db error")
}
