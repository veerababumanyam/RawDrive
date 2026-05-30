package user_test

import (
	"context"
	"strings"
	"testing"

	"github.com/rawdrive/backend/internal/user"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockUserRepo simulates user persistence.
type mockUserRepo struct {
	users   map[string]*user.User
	byEmail map[string]*user.User
	byPhone map[string]*user.User
}

func newMockUserRepo() *mockUserRepo {
	return &mockUserRepo{
		users:   map[string]*user.User{},
		byEmail: map[string]*user.User{},
		byPhone: map[string]*user.User{},
	}
}

func (m *mockUserRepo) Create(ctx context.Context, u *user.User) (*user.User, error) {
	if _, exists := m.byEmail[u.Email]; exists {
		return nil, user.ErrConflict
	}
	if u.Phone != "" {
		if _, exists := m.byPhone[u.Phone]; exists {
			// Mirrors the real PgRepo: users_phone_key violations come
			// back as ErrPhoneTaken so the adapter + auth handler can
			// respond 409 instead of a generic 500.
			return nil, user.ErrPhoneTaken
		}
	}
	m.users[u.ID] = u
	if u.Email != "" {
		m.byEmail[u.Email] = u
	}
	if u.Phone != "" {
		m.byPhone[u.Phone] = u
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

func (m *mockUserRepo) UpdatePasswordByID(_ context.Context, id, hashedPassword string, mustChange bool) error {
	u, ok := m.users[id]
	if !ok {
		return user.ErrNotFound
	}
	u.PasswordHash = &hashedPassword
	u.MustChangePassword = mustChange
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

// TestCreateUser_DuplicatePhone pins the repo contract used by the
// register handler: a second user with an already-taken phone must
// come back as ErrPhoneTaken, not a generic DB error. Previously this
// surfaced as a 500 "failed to create user" in production because the
// handler swallowed the raw pg 23505 — the auth handler now recognizes
// this sentinel and responds 409 with an actionable message.
func TestCreateUser_DuplicatePhone(t *testing.T) {
	svc := newTestUserService()
	ctx := context.Background()

	_, err := svc.Create(ctx, user.CreateUserInput{
		Email: "first@example.com",
		Phone: "+919876543210",
	})
	require.NoError(t, err)

	_, err = svc.Create(ctx, user.CreateUserInput{
		Email: "second@example.com",
		Phone: "+919876543210",
	})
	assert.ErrorIs(t, err, user.ErrPhoneTaken, "duplicate phone must return ErrPhoneTaken")
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

func TestUpdateUserProfile_Phone(t *testing.T) {
	svc := newTestUserService()
	ctx := context.Background()

	created, err := svc.Create(ctx, user.CreateUserInput{Email: "phone@example.com"})
	require.NoError(t, err)

	updated, err := svc.Update(ctx, created.ID, user.UpdateUserInput{
		Phone: strPtr("+919876543210"),
	})
	require.NoError(t, err)
	assert.Equal(t, "+919876543210", updated.Phone)
	// Display name and avatar should remain unchanged.
	assert.Equal(t, "", updated.DisplayName)
	assert.Equal(t, "", updated.AvatarURL)
}

func TestChangePassword_RejectsOverlongPasswordBeforeHash(t *testing.T) {
	repo := newMockUserRepo()
	svc := user.NewService(repo)
	ctx := context.Background()

	created, err := svc.Create(ctx, user.CreateUserInput{
		Email:    "changepw@example.com",
		Password: "CurrentStr0ng!Pass",
	})
	require.NoError(t, err)
	require.NotNil(t, created.PasswordHash)
	originalHash := *created.PasswordHash

	err = svc.ChangePassword(ctx, created.ID, "CurrentStr0ng!Pass", "Aa1!"+strings.Repeat("x", 69))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "password does not meet complexity requirements")
	assert.Equal(t, originalHash, *repo.users[created.ID].PasswordHash,
		"overlong password must be rejected before bcrypt/update")
}

func strPtr(s string) *string {
	return &s
}
