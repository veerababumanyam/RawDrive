package team_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/team"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ──────────────────────────── Handler-specific mocks ────────────────────────────
// Note: mockInvitationRepo, mockEmailSender, mockMemberRepo, mockUserLookup
// are already declared in invitation_service_test.go (same package).

// handlerPermChecker is a mock permission checker for handler tests.
type handlerPermChecker struct {
	allowed bool
}

func (m *handlerPermChecker) Evaluate(_ context.Context, _, _, _, _ string) (bool, error) {
	return m.allowed, nil
}

// handlerMemberLister is a mock member lister for handler tests.
type handlerMemberLister struct {
	members []team.MemberResponse
}

func (m *handlerMemberLister) ListMembers(_ string) ([]team.MemberResponse, error) {
	return m.members, nil
}

// ──────────────────────────── Helpers ────────────────────────────

// Use plain string key so it matches the handler's fallback lookup.

func newHandlerTestServer(
	invRepo *mockInvitationRepo,
	emailSender *mockEmailSender,
	memberRepo *mockMemberRepo,
	userLookup *mockUserLookup,
	perm team.PermissionChecker,
	memberLister team.MemberLister,
	claims map[string]interface{},
) *httptest.Server {
	svc := team.NewInvitationService(
		invRepo, emailSender, memberRepo, userLookup,
		team.InvitationConfig{ExpiryDuration: 7 * 24 * time.Hour},
	)
	handler := team.NewHandler(svc, perm, memberLister)
	r := chi.NewRouter()
	if claims != nil {
		r.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				ctx := middleware.WithJWTClaims(r.Context(), claims)
				next.ServeHTTP(w, r.WithContext(ctx))
			})
		})
	}
	r.Mount("/team", handler.Routes())
	return httptest.NewServer(r)
}

func handlerPostJSON(url string, body interface{}) (*http.Response, error) {
	b, _ := json.Marshal(body)
	return http.Post(url, "application/json", bytes.NewReader(b))
}

func handlerDeleteReq(url string) (*http.Response, error) {
	req, _ := http.NewRequest("DELETE", url, nil)
	return http.DefaultClient.Do(req)
}

// ──────────────────────────── Tests ────────────────────────────

func TestInviteHandler_Success(t *testing.T) {
	invRepo := newMockInvitationRepo()
	emailSender := &mockEmailSender{}
	memberRepo := newMockMemberRepo()
	userLookup := &mockUserLookup{users: map[string]string{"new@example.com": "user-new"}}
	perm := &handlerPermChecker{allowed: true}

	claims := map[string]interface{}{
		"sub":          "user-admin",
		"workspace_id": "ws-1",
		"state_id":     "MH",
		"role":         "Admin",
	}

	ts := newHandlerTestServer(invRepo, emailSender, memberRepo, userLookup, perm, nil, claims)
	defer ts.Close()

	resp, err := handlerPostJSON(ts.URL+"/team/invite", map[string]string{
		"email":        "new@example.com",
		"workspace_id": "ws-1",
		"role":         "Editor",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	assert.Contains(t, emailSender.sentEmails, "new@example.com")
}

func TestInviteHandler_NoPermission(t *testing.T) {
	invRepo := newMockInvitationRepo()
	emailSender := &mockEmailSender{}
	memberRepo := newMockMemberRepo()
	userLookup := &mockUserLookup{}
	perm := &handlerPermChecker{allowed: false}

	claims := map[string]interface{}{
		"sub":          "user-viewer",
		"workspace_id": "ws-1",
		"state_id":     "MH",
		"role":         "Viewer",
	}

	ts := newHandlerTestServer(invRepo, emailSender, memberRepo, userLookup, perm, nil, claims)
	defer ts.Close()

	resp, err := handlerPostJSON(ts.URL+"/team/invite", map[string]string{
		"email":        "new@example.com",
		"workspace_id": "ws-1",
		"role":         "Editor",
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestAcceptInviteHandler_Success(t *testing.T) {
	invRepo := newMockInvitationRepo()
	emailSender := &mockEmailSender{}
	memberRepo := newMockMemberRepo()
	userLookup := &mockUserLookup{users: map[string]string{"invitee@example.com": "user-invitee"}}
	perm := &handlerPermChecker{allowed: true}

	svc := team.NewInvitationService(
		invRepo, emailSender, memberRepo, userLookup,
		team.InvitationConfig{ExpiryDuration: 7 * 24 * time.Hour},
	)

	// Create invitation via service
	err := svc.Invite(context.Background(), "invitee@example.com", "ws-1", team.RoleEditor)
	require.NoError(t, err)

	// Find the token from the repo
	var token string
	for _, inv := range invRepo.invitations {
		if inv.Email == "invitee@example.com" {
			token = inv.Token
			break
		}
	}
	require.NotEmpty(t, token)

	handler := team.NewHandler(svc, perm, nil)
	r := chi.NewRouter()
	r.Mount("/team", handler.Routes())
	ts := httptest.NewServer(r)
	defer ts.Close()

	resp, err := handlerPostJSON(ts.URL+"/team/accept", map[string]string{
		"token": token,
	})
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestRemoveMemberHandler_Success(t *testing.T) {
	invRepo := newMockInvitationRepo()
	emailSender := &mockEmailSender{}
	memberRepo := newMockMemberRepo()
	memberRepo.members["ws-1"] = map[string]bool{"user-remove": true}
	userLookup := &mockUserLookup{}
	perm := &handlerPermChecker{allowed: true}

	claims := map[string]interface{}{
		"sub":          "user-admin",
		"workspace_id": "ws-1",
		"state_id":     "MH",
		"role":         "Admin",
	}

	ts := newHandlerTestServer(invRepo, emailSender, memberRepo, userLookup, perm, nil, claims)
	defer ts.Close()

	resp, err := handlerDeleteReq(ts.URL + "/team/members/user-remove")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestListMembersHandler_Success(t *testing.T) {
	invRepo := newMockInvitationRepo()
	emailSender := &mockEmailSender{}
	memberRepo := newMockMemberRepo()
	userLookup := &mockUserLookup{}
	perm := &handlerPermChecker{allowed: true}
	memberLister := &handlerMemberLister{
		members: []team.MemberResponse{
			{UserID: "user-1", WorkspaceID: "ws-1", Role: "Owner"},
			{UserID: "user-2", WorkspaceID: "ws-1", Role: "Editor"},
		},
	}

	claims := map[string]interface{}{
		"sub":          "user-1",
		"workspace_id": "ws-1",
		"state_id":     "MH",
		"role":         "Owner",
	}

	ts := newHandlerTestServer(invRepo, emailSender, memberRepo, userLookup, perm, memberLister, claims)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/team/members")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var members []team.MemberResponse
	json.NewDecoder(resp.Body).Decode(&members)
	assert.Len(t, members, 2)
}

func TestRevokeInviteHandler_Success(t *testing.T) {
	invRepo := newMockInvitationRepo()
	emailSender := &mockEmailSender{}
	memberRepo := newMockMemberRepo()
	userLookup := &mockUserLookup{}
	perm := &handlerPermChecker{allowed: true}

	claims := map[string]interface{}{
		"sub":          "user-admin",
		"workspace_id": "ws-1",
		"state_id":     "MH",
		"role":         "Admin",
	}

	ts := newHandlerTestServer(invRepo, emailSender, memberRepo, userLookup, perm, nil, claims)
	defer ts.Close()

	resp, err := handlerDeleteReq(ts.URL + "/team/invites/inv-123")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

// ──────────────────────────── F-061 regression ────────────────────────────

// scopedRevokerService is a fake InvitationService that also implements
// team.WorkspaceScopedRevoker so it exercises the workspace-scoped revoke
// path. It models invitations keyed by id with their owning workspace and
// only permits revocation when the caller's workspace matches — exactly what
// the F-061 fix relies on at the data layer.
type scopedRevokerService struct {
	// invitationID -> owning workspaceID
	owner map[string]string
	// records the (workspaceID, invitationID) pairs the handler asked to revoke
	revokedScoped []string
}

func newScopedRevokerService(owner map[string]string) *scopedRevokerService {
	return &scopedRevokerService{owner: owner}
}

func (s *scopedRevokerService) Invite(_ context.Context, _, _ string, _ team.Role) error {
	return nil
}
func (s *scopedRevokerService) AcceptInvitation(_ context.Context, _ string) error { return nil }
func (s *scopedRevokerService) RevokeInvitation(_ context.Context, _ string) error {
	// Legacy unscoped path — should never be hit when the scoped one exists.
	return nil
}
func (s *scopedRevokerService) RemoveMember(_ context.Context, _, _ string) error { return nil }

func (s *scopedRevokerService) RevokeInvitationInWorkspace(_ context.Context, workspaceID, invitationID string) error {
	ownerWS, ok := s.owner[invitationID]
	if !ok || ownerWS != workspaceID {
		// Not found, or belongs to a different tenant — indistinguishable by design.
		return team.ErrInvitationNotFound
	}
	s.revokedScoped = append(s.revokedScoped, workspaceID+"/"+invitationID)
	return nil
}

func newScopedRevokeTestServer(svc team.InvitationService, perm team.PermissionChecker, claims map[string]interface{}) *httptest.Server {
	handler := team.NewHandler(svc, perm, nil)
	r := chi.NewRouter()
	if claims != nil {
		r.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				ctx := middleware.WithJWTClaims(r.Context(), claims)
				next.ServeHTTP(w, r.WithContext(ctx))
			})
		})
	}
	r.Mount("/team", handler.Routes())
	return httptest.NewServer(r)
}

// TestF061_RevokeInvite_CrossTenantBlocked verifies that a caller in workspace
// A cannot revoke an invitation that belongs to workspace B. Before the fix
// the handler passed only the invite id through and the service revoked it
// regardless of workspace; now the scoped path returns ErrInvitationNotFound
// for a foreign-workspace invite and the handler answers 404 without revoking.
func TestF061_RevokeInvite_CrossTenantBlocked(t *testing.T) {
	// inv-b belongs to workspace B.
	svc := newScopedRevokerService(map[string]string{"inv-b": "ws-b"})
	perm := &handlerPermChecker{allowed: true}

	// Caller is authenticated for workspace A.
	claims := map[string]interface{}{
		"sub":          "attacker",
		"workspace_id": "ws-a",
		"role":         "Admin",
	}

	ts := newScopedRevokeTestServer(svc, perm, claims)
	defer ts.Close()

	resp, err := handlerDeleteReq(ts.URL + "/team/invites/inv-b")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNotFound, resp.StatusCode, "cross-tenant revoke must not succeed")
	assert.Empty(t, svc.revokedScoped, "no invitation should have been revoked")
}

// TestF061_RevokeInvite_SameTenantSucceeds verifies the happy path still works:
// a caller revoking an invite within their own workspace gets 204 and the
// scoped revoke is invoked with their workspace_id.
func TestF061_RevokeInvite_SameTenantSucceeds(t *testing.T) {
	svc := newScopedRevokerService(map[string]string{"inv-a": "ws-a"})
	perm := &handlerPermChecker{allowed: true}

	claims := map[string]interface{}{
		"sub":          "admin",
		"workspace_id": "ws-a",
		"role":         "Admin",
	}

	ts := newScopedRevokeTestServer(svc, perm, claims)
	defer ts.Close()

	resp, err := handlerDeleteReq(ts.URL + "/team/invites/inv-a")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
	require.Len(t, svc.revokedScoped, 1)
	assert.Equal(t, "ws-a/inv-a", svc.revokedScoped[0])
}

// TestF061_RevokeInvite_MissingWorkspaceRejected verifies that a request whose
// JWT carries no workspace_id is rejected before any revoke is attempted — an
// unscoped request can no longer reach the service.
func TestF061_RevokeInvite_MissingWorkspaceRejected(t *testing.T) {
	svc := newScopedRevokerService(map[string]string{"inv-a": "ws-a"})
	perm := &handlerPermChecker{allowed: true}

	// No workspace_id claim.
	claims := map[string]interface{}{
		"sub":  "admin",
		"role": "Admin",
	}

	ts := newScopedRevokeTestServer(svc, perm, claims)
	defer ts.Close()

	resp, err := handlerDeleteReq(ts.URL + "/team/invites/inv-a")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	assert.Empty(t, svc.revokedScoped, "no revoke should be attempted without workspace context")
}

// TestF061_RevokeInvite_NoPermissionRejected verifies the defense-in-depth
// permission gate: a caller without team:manage on their workspace is denied.
func TestF061_RevokeInvite_NoPermissionRejected(t *testing.T) {
	svc := newScopedRevokerService(map[string]string{"inv-a": "ws-a"})
	perm := &handlerPermChecker{allowed: false}

	claims := map[string]interface{}{
		"sub":          "viewer",
		"workspace_id": "ws-a",
		"role":         "Viewer",
	}

	ts := newScopedRevokeTestServer(svc, perm, claims)
	defer ts.Close()

	resp, err := handlerDeleteReq(ts.URL + "/team/invites/inv-a")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	assert.Empty(t, svc.revokedScoped)
}
