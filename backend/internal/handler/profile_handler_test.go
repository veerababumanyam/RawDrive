package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/user"
)

// stubUserService is a minimal in-memory user.Service for handler tests.
type stubUserService struct {
	users map[string]*user.User
}

func newStubUserService() *stubUserService {
	return &stubUserService{users: map[string]*user.User{}}
}

func (s *stubUserService) Create(_ context.Context, input user.CreateUserInput) (*user.User, error) {
	u := &user.User{
		ID:          "test-id",
		Email:       input.Email,
		Phone:       input.Phone,
		DisplayName: input.DisplayName,
	}
	s.users[u.ID] = u
	return u, nil
}

func (s *stubUserService) GetByID(_ context.Context, id string) (*user.User, error) {
	if u, ok := s.users[id]; ok {
		return u, nil
	}
	return nil, user.ErrNotFound
}

func (s *stubUserService) GetByEmail(_ context.Context, email string) (*user.User, error) {
	for _, u := range s.users {
		if u.Email == email {
			return u, nil
		}
	}
	return nil, user.ErrNotFound
}

func (s *stubUserService) Update(_ context.Context, id string, input user.UpdateUserInput) (*user.User, error) {
	u, ok := s.users[id]
	if !ok {
		return nil, user.ErrNotFound
	}
	if input.DisplayName != nil {
		u.DisplayName = *input.DisplayName
	}
	if input.AvatarURL != nil {
		u.AvatarURL = *input.AvatarURL
	}
	if input.Phone != nil {
		u.Phone = *input.Phone
	}
	return u, nil
}

func (s *stubUserService) MarkEmailVerified(_ context.Context, _ string) error {
	return nil
}

func (s *stubUserService) ChangePassword(_ context.Context, _, _, _ string) error {
	return nil
}

func TestUpdateProfile_Success(t *testing.T) {
	svc := newStubUserService()
	svc.users["user-123"] = &user.User{
		ID:    "user-123",
		Email: "test@example.com",
	}

	h := handler.NewProfileHandler(svc)

	body, _ := json.Marshal(map[string]string{
		"display_name": "Updated Name",
		"phone":        "+919876543210",
	})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/users/profile", bytes.NewReader(body))
	ctx := middleware.WithJWTClaims(req.Context(), map[string]interface{}{"sub": "user-123"})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	h.UpdateProfile(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Equal(t, "Updated Name", resp["display_name"])
	assert.Equal(t, "+919876543210", resp["phone"])
	assert.Equal(t, "test@example.com", resp["email"])
}

func TestUpdateProfile_Unauthorized(t *testing.T) {
	svc := newStubUserService()
	h := handler.NewProfileHandler(svc)

	body, _ := json.Marshal(map[string]string{"display_name": "Hacker"})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/users/profile", bytes.NewReader(body))
	// No JWT claims injected — should 401.

	rr := httptest.NewRecorder()
	h.UpdateProfile(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestGetProfile_Success(t *testing.T) {
	svc := newStubUserService()
	svc.users["user-456"] = &user.User{
		ID:          "user-456",
		Email:       "profile@example.com",
		DisplayName: "Profile User",
		Phone:       "+911234567890",
	}

	h := handler.NewProfileHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/users/profile", nil)
	ctx := middleware.WithJWTClaims(req.Context(), map[string]interface{}{"sub": "user-456"})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	h.GetProfile(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Equal(t, "user-456", resp["id"])
	assert.Equal(t, "profile@example.com", resp["email"])
	assert.Equal(t, "Profile User", resp["display_name"])
	assert.Equal(t, "+911234567890", resp["phone"])
}

func TestGetProfile_Unauthorized(t *testing.T) {
	svc := newStubUserService()
	h := handler.NewProfileHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/users/profile", nil)

	rr := httptest.NewRecorder()
	h.GetProfile(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}
