package user_test

import (
	"context"
	"testing"

	"github.com/rawdrive/backend/internal/user"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockUserRepo simulates user persistence.
type mockUserRepo struct {
	users   map[string]*user.User
	byEmail map[string]*user.User
}

func newMockUserRepo() *mockUserRepo {
	return &mockUserRepo{
		users:   map[string]*user.User{},
		byEmail: map[string]*user.User{},
	}
}

func (m *mockUserRepo) Create(ctx context.Context, u *user.User) (*user.User, error) {
	if _, exists := m.byEmail[u.Email]; exists {
		return nil, user.ErrConflict
	}
	m.users[u.ID] = u
	if u.Email != "" {
		m.byEmail[u.Email] = u
	}
	return u, nil
}

func (m *mockUserRepo) GetByID(ctx context.Context, id string) (*user.User, error) {
	if u, ok := m.users[id]; ok {
		return u, nil
	}
	return nil, user.ErrNotFound
}

func (m *mockUserRepo) GetByEmail(ctx context.Context, email string) (*user.User, error) {
	if u, ok := m.byEmail[email]; ok {
		return u, nil
	}
	return nil, user.ErrNotFound
}

func (m *mockUserRepo) Update(ctx context.Context, u *user.User) (*user.User, error) {
	m.users[u.ID] = u
	return u, nil
}

func (m *mockUserRepo) MarkEmailVerified(_ context.Context, id string) error {
	u, ok := m.users[id]
	if !ok {
		return user.ErrNotFound
	}
	u.EmailVerified = true
	return nil
}

func newTestUserService() user.Service {
	return user.NewService(newMockUserRepo())
}

func TestCreateUser_Email(t *testing.T) {
	svc := newTestUserService()
	ctx := context.Background()

	u, err := svc.Create(ctx, user.CreateUserInput{
		Email: "user@example.com",
	})
	require.NoError(t, err)
	require.NotNil(t, u)
	assert.Equal(t, "user@example.com", u.Email)
	assert.NotEmpty(t, u.ID)
}

func TestCreateUser_Phone(t *testing.T) {
	svc := newTestUserService()
	ctx := context.Background()

	u, err := svc.Create(ctx, user.CreateUserInput{
		Phone: "+919876543210",
	})
	require.NoError(t, err)
	require.NotNil(t, u)
	assert.Equal(t, "+919876543210", u.Phone)
}

func TestCreateUser_DuplicateEmail(t *testing.T) {
	svc := newTestUserService()
	ctx := context.Background()

	_, err := svc.Create(ctx, user.CreateUserInput{Email: "dup@example.com"})
	require.NoError(t, err)

	_, err = svc.Create(ctx, user.CreateUserInput{Email: "dup@example.com"})
	assert.ErrorIs(t, err, user.ErrConflict, "duplicate email should return conflict error")
}

func TestGetUserByID(t *testing.T) {
	svc := newTestUserService()
	ctx := context.Background()

	created, err := svc.Create(ctx, user.CreateUserInput{Email: "lookup@example.com"})
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "lookup@example.com", found.Email)
}

func TestGetUserByEmail(t *testing.T) {
	svc := newTestUserService()
	ctx := context.Background()

	_, err := svc.Create(ctx, user.CreateUserInput{Email: "find@example.com"})
	require.NoError(t, err)

	found, err := svc.GetByEmail(ctx, "find@example.com")
	require.NoError(t, err)
	assert.Equal(t, "find@example.com", found.Email)
}

func TestUpdateUserProfile(t *testing.T) {
	svc := newTestUserService()
	ctx := context.Background()

	created, err := svc.Create(ctx, user.CreateUserInput{Email: "update@example.com"})
	require.NoError(t, err)

	updated, err := svc.Update(ctx, created.ID, user.UpdateUserInput{
		DisplayName: strPtr("New Name"),
		AvatarURL:   strPtr("https://example.com/new-avatar.jpg"),
	})
	require.NoError(t, err)
	assert.Equal(t, "New Name", updated.DisplayName)
	assert.Equal(t, "https://example.com/new-avatar.jpg", updated.AvatarURL)
}

func strPtr(s string) *string {
	return &s
}
