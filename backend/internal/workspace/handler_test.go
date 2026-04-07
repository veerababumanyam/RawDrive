package workspace_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/workspace"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ──────────────────────────── Mock Service ────────────────────────────

type mockWorkspaceService struct {
	workspaces map[string]*workspace.Workspace
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

func (m *mockWorkspaceService) GetByID(_ context.Context, id string) (*workspace.Workspace, error) {
	ws, ok := m.workspaces[id]
	if !ok {
		return nil, workspace.ErrNotFound
	}
	return ws, nil
}

// ──────────────────────────── Helpers ────────────────────────────

// Use plain string key so it matches the handler's fallback lookup.

func newWSTestServer(svc workspace.Service, claims map[string]interface{}) *httptest.Server {
	handler := workspace.NewHandler(svc)
	r := chi.NewRouter()
	if claims != nil {
		r.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				ctx := context.WithValue(r.Context(), "jwt_claims", claims)
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
		"state_id":     "MH",
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

func (e *errorWorkspaceService) GetByID(_ context.Context, _ string) (*workspace.Workspace, error) {
	return nil, errors.New("db error")
}
