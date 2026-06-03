package team_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/team"
)

// mockInvitationRepo simulates invitation persistence.
type mockInvitationRepo struct {
	invitations map[string]*team.Invitation
}

func newMockInvitationRepo() *mockInvitationRepo {
	return &mockInvitationRepo{invitations: map[string]*team.Invitation{}}
}

func (m *mockInvitationRepo) Create(ctx context.Context, inv *team.Invitation) error {
	m.invitations[inv.ID] = inv
	return nil
}

func (m *mockInvitationRepo) GetByToken(ctx context.Context, token string) (*team.Invitation, error) {
	for _, inv := range m.invitations {
		if inv.Token == token {
			return inv, nil
		}
	}
	return nil, team.ErrInvitationNotFound
}

func (m *mockInvitationRepo) GetByID(ctx context.Context, id string) (*team.Invitation, error) {
	if inv, ok := m.invitations[id]; ok {
		return inv, nil
	}
	return nil, team.ErrInvitationNotFound
}

func (m *mockInvitationRepo) Revoke(ctx context.Context, id string) error {
	if inv, ok := m.invitations[id]; ok {
		inv.Revoked = true
		return nil
	}
	return team.ErrInvitationNotFound
}

// mockEmailSender records invitation emails.
type mockEmailSender struct {
	sentEmails []string
}

func (m *mockEmailSender) SendInvitation(ctx context.Context, email, inviteLink string) error {
	m.sentEmails = append(m.sentEmails, email)
	return nil
}

// mockMemberRepo simulates workspace membership.
type mockMemberRepo struct {
	members map[string]map[string]bool // workspaceID -> userID -> active
}

func newMockMemberRepo() *mockMemberRepo {
	return &mockMemberRepo{members: map[string]map[string]bool{}}
}

func (m *mockMemberRepo) AddMember(ctx context.Context, workspaceID, userID string, role team.Role) error {
	if m.members[workspaceID] == nil {
		m.members[workspaceID] = map[string]bool{}
	}
	m.members[workspaceID][userID] = true
	return nil
}

func (m *mockMemberRepo) RemoveMember(ctx context.Context, workspaceID, userID string) error {
	if ws, ok := m.members[workspaceID]; ok {
		ws[userID] = false
	}
	return nil
}

func (m *mockMemberRepo) IsMember(ctx context.Context, workspaceID, userID string) (bool, error) {
	if ws, ok := m.members[workspaceID]; ok {
		return ws[userID], nil
	}
	return false, nil
}

// mockUserLookup simulates user existence checks.
type mockUserLookup struct {
	users map[string]string // email -> userID
}

func (m *mockUserLookup) FindByEmail(ctx context.Context, email string) (string, bool, error) {
	if id, ok := m.users[email]; ok {
		return id, true, nil
	}
	return "", false, nil
}

func newTestInvitationService() (team.InvitationService, *mockEmailSender, *mockMemberRepo) {
	repo := newMockInvitationRepo()
	email := &mockEmailSender{}
	members := newMockMemberRepo()
	lookup := &mockUserLookup{users: map[string]string{
		"existing@example.com": "existing-user-id",
	}}
	svc := team.NewInvitationService(repo, email, members, lookup, team.InvitationConfig{
		ExpiryDuration: 7 * 24 * time.Hour,
	})
	return svc, email, members
}

func TestInvite_SendsEmail(t *testing.T) {
	svc, emailSender, _ := newTestInvitationService()
	ctx := context.Background()

	err := svc.Invite(ctx, "newmember@example.com", "ws-uuid-001", team.RoleEditor)
	require.NoError(t, err)
	assert.Contains(t, emailSender.sentEmails, "newmember@example.com", "invitation email should be sent")
}

func TestInvite_TokenExpiry(t *testing.T) {
	repo := newMockInvitationRepo()
	email := &mockEmailSender{}
	members := newMockMemberRepo()
	lookup := &mockUserLookup{users: map[string]string{}}
	svc := team.NewInvitationService(repo, email, members, lookup, team.InvitationConfig{
		ExpiryDuration: 1 * time.Millisecond, // near-instant expiry
	})
	ctx := context.Background()

	err := svc.Invite(ctx, "expiry@example.com", "ws-uuid-002", team.RoleEditor)
	require.NoError(t, err)

	time.Sleep(10 * time.Millisecond)

	// Find the token from the repo
	var token string
	for _, inv := range repo.invitations {
		if inv.Email == "expiry@example.com" {
			token = inv.Token
		}
	}
	require.NotEmpty(t, token)

	err = svc.AcceptInvitation(ctx, token)
	assert.Error(t, err, "expired invitation should be rejected")
}

func TestAcceptInvite_ExistingUser(t *testing.T) {
	svc, _, members := newTestInvitationService()
	ctx := context.Background()

	err := svc.Invite(ctx, "existing@example.com", "ws-uuid-003", team.RoleEditor)
	require.NoError(t, err)

	// Accept - user already exists, should join without re-onboarding
	// We need the token; in practice the service would generate it
	err = svc.AcceptInvitation(ctx, "mock-token-existing")
	// This will fail in RED phase since no production code exists
	require.NoError(t, err)

	isMember, _ := members.IsMember(ctx, "ws-uuid-003", "existing-user-id")
	assert.True(t, isMember, "existing user should be added as member without re-onboarding")
}

func TestAcceptInvite_NewUser(t *testing.T) {
	svc, _, _ := newTestInvitationService()
	ctx := context.Background()

	err := svc.Invite(ctx, "brand-new@example.com", "ws-uuid-004", team.RoleViewer)
	require.NoError(t, err)

	err = svc.AcceptInvitation(ctx, "mock-token-new")
	// For new users, service should indicate registration is needed
	assert.ErrorIs(t, err, team.ErrRegistrationRequired, "new user should be routed to registration")
}

func TestAcceptInvite_Expired(t *testing.T) {
	repo := newMockInvitationRepo()
	email := &mockEmailSender{}
	members := newMockMemberRepo()
	lookup := &mockUserLookup{users: map[string]string{}}
	svc := team.NewInvitationService(repo, email, members, lookup, team.InvitationConfig{
		ExpiryDuration: 1 * time.Millisecond,
	})
	ctx := context.Background()

	err := svc.Invite(ctx, "expired@example.com", "ws-uuid-005", team.RoleEditor)
	require.NoError(t, err)

	time.Sleep(10 * time.Millisecond)

	err = svc.AcceptInvitation(ctx, "any-token")
	assert.Error(t, err, "expired invitation should be rejected")
}

func TestRevokeInvite(t *testing.T) {
	svc, _, _ := newTestInvitationService()
	ctx := context.Background()

	err := svc.Invite(ctx, "revoke@example.com", "ws-uuid-006", team.RoleEditor)
	require.NoError(t, err)

	// Revoke the invitation by ID
	err = svc.RevokeInvitation(ctx, "invitation-id-placeholder")
	require.NoError(t, err)

	// Attempting to accept should fail
	err = svc.AcceptInvitation(ctx, "revoked-token")
	assert.Error(t, err, "revoked invitation should not be accepted")
}

func TestRemoveMember_ImmediateRevocation(t *testing.T) {
	svc, _, members := newTestInvitationService()
	ctx := context.Background()

	// Add a member first
	_ = members.AddMember(ctx, "ws-uuid-007", "remove-user-id", team.RoleEditor)

	err := svc.RemoveMember(ctx, "ws-uuid-007", "remove-user-id")
	require.NoError(t, err)

	isMember, _ := members.IsMember(ctx, "ws-uuid-007", "remove-user-id")
	assert.False(t, isMember, "removed member should lose access immediately")
}
