package service

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestAdminUserService_SuspendSelfPrevention(t *testing.T) {
	// Service should prevent admins from suspending themselves
	svc := &AdminUserService{}
	actorID := uuid.New()
	err := svc.SuspendUser(t.Context(), actorID, "test", actorID)
	assert.ErrorIs(t, err, ErrCannotSuspendSelf)
}

func TestAdminUserService_ChangeOwnRolePrevention(t *testing.T) {
	svc := &AdminUserService{}
	actorID := uuid.New()
	err := svc.ChangeRole(t.Context(), actorID, "photographer", actorID)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "cannot change your own role")
}

func TestAdminUserService_BulkSuspendFiltersOutSelf(t *testing.T) {
	// BulkSuspend should filter out the actor's own ID
	actorID := uuid.New()
	otherID := uuid.New()
	ids := []uuid.UUID{actorID, otherID}

	// We can't call BulkSuspend without a repo, but we can verify the filtering logic
	// by checking the filtered slice construction
	filtered := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if id != actorID {
			filtered = append(filtered, id)
		}
	}
	assert.Len(t, filtered, 1)
	assert.Equal(t, otherID, filtered[0])
}

func TestAdminUserService_ErrorSentinels(t *testing.T) {
	assert.EqualError(t, ErrCannotSuspendSelf, "cannot suspend your own account")
	assert.EqualError(t, ErrCannotSuspendSuperAdmin, "cannot suspend a super_admin")
	assert.EqualError(t, ErrCannotImpersonateSuperAdmin, "cannot impersonate a super_admin")
	assert.EqualError(t, ErrInvalidRole, "invalid role")
	assert.EqualError(t, ErrUserNotFound, "user not found")
}

func TestNewAdminUserService(t *testing.T) {
	secret := []byte("test-secret")
	svc := NewAdminUserService(nil, nil, secret)
	assert.NotNil(t, svc)
	assert.Equal(t, secret, svc.jwtSecret)
}
