package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/middleware"
)

// mockDBContext records SET app.workspace_id calls.
type mockDBContext struct {
	setWorkspaceID string
}

func (m *mockDBContext) SetWorkspaceID(ctx context.Context, workspaceID string) error {
	m.setWorkspaceID = workspaceID
	return nil
}

// mockAuditLog records access logs.
type mockAuditLog struct {
	entries []string
}

func (m *mockAuditLog) LogAccess(ctx context.Context, workspaceID, action, ipAddress, userAgent string) {
	m.entries = append(m.entries, workspaceID+":"+action)
}

// helper to create a request with JWT claims in context
func requestWithClaims(claims map[string]interface{}) *http.Request {
	req := httptest.NewRequest(http.MethodGet, "/api/files", nil)
	ctx := middleware.WithJWTClaims(req.Context(), claims)
	return req.WithContext(ctx)
}

func TestTenantMiddleware_ExtractsWorkspaceID(t *testing.T) {
	db := &mockDBContext{}
	audit := &mockAuditLog{}
	handler := middleware.TenantContext(db, audit)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		wsID := middleware.WorkspaceIDFromContext(r.Context())
		assert.Equal(t, "ws-uuid-123", wsID)
		w.WriteHeader(http.StatusOK)
	}))

	req := requestWithClaims(map[string]interface{}{
		"workspace_id": "ws-uuid-123",
		"state_id":     "state-uuid-001",
	})
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestTenantMiddleware_SetsContext(t *testing.T) {
	db := &mockDBContext{}
	audit := &mockAuditLog{}
	var capturedWSID string

	handler := middleware.TenantContext(db, audit)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedWSID = middleware.WorkspaceIDFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := requestWithClaims(map[string]interface{}{
		"workspace_id": "ws-uuid-456",
		"state_id":     "state-uuid-002",
	})
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, "ws-uuid-456", capturedWSID)
}

func TestTenantMiddleware_MissingClaim(t *testing.T) {
	db := &mockDBContext{}
	audit := &mockAuditLog{}
	handler := middleware.TenantContext(db, audit)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := requestWithClaims(map[string]interface{}{
		// no workspace_id
	})
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestTenantMiddleware_InvalidWorkspace(t *testing.T) {
	db := &mockDBContext{}
	audit := &mockAuditLog{}
	handler := middleware.TenantContext(db, audit)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := requestWithClaims(map[string]interface{}{
		"workspace_id": "",
		"state_id":     "state-uuid-003",
	})
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestTenantMiddleware_SetsDBContext(t *testing.T) {
	db := &mockDBContext{}
	audit := &mockAuditLog{}
	handler := middleware.TenantContext(db, audit)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := requestWithClaims(map[string]interface{}{
		"workspace_id": "ws-uuid-789",
		"state_id":     "state-uuid-004",
	})
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "ws-uuid-789", db.setWorkspaceID, "should call SET app.workspace_id")
}

func TestTenantMiddleware_ImmutableState(t *testing.T) {
	db := &mockDBContext{}
	audit := &mockAuditLog{}
	handler := middleware.TenantContext(db, audit)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		stateID := middleware.StateIDFromContext(r.Context())
		assert.Equal(t, "state-uuid-005", stateID, "state_id should come from JWT, not client")
		w.WriteHeader(http.StatusOK)
	}))

	req := requestWithClaims(map[string]interface{}{
		"workspace_id": "ws-uuid-immutable",
		"state_id":     "state-uuid-005",
	})
	// Client tries to override state_id via header
	req.Header.Set("X-State-ID", "hacked-state-id")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestTenantMiddleware_CrossWorkspace(t *testing.T) {
	db := &mockDBContext{}
	audit := &mockAuditLog{}
	handler := middleware.TenantContext(db, audit)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := requestWithClaims(map[string]interface{}{
		"workspace_id": "ws-uuid-A",
		"state_id":     "state-uuid-A",
	})
	// Request targets a different workspace via URL
	req = httptest.NewRequest(http.MethodGet, "/api/workspaces/ws-uuid-B/files", nil)
	ctx := middleware.WithJWTClaims(req.Context(), map[string]interface{}{
		"workspace_id": "ws-uuid-A",
		"state_id":     "state-uuid-A",
	})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusForbidden, rr.Code, "cross-workspace access should be forbidden")
}

func TestTenantMiddleware_AuditTrail(t *testing.T) {
	db := &mockDBContext{}
	audit := &mockAuditLog{}
	handler := middleware.TenantContext(db, audit)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := requestWithClaims(map[string]interface{}{
		"workspace_id": "ws-uuid-audit",
		"state_id":     "state-uuid-audit",
	})
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	assert.NotEmpty(t, audit.entries, "workspace access should be logged to audit trail")
}
