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
