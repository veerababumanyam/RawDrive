package user

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrConflict = errors.New("conflict: resource already exists")
	ErrNotFound = errors.New("not found")
)

type User struct {
	ID            string
	Email         string
	Phone         string
	DisplayName   string
	AvatarURL     string
	PasswordHash  *string
	EmailVerified bool
	PlatformRole  string // super_admin|admin|dealer|photographer|team_member|client
	// StateID is the FK to states.id (Indian state / UT). Mandatory at
	// registration per CLAUDE.md — callers set it during Create; the repo
	// INSERT persists it so onboarding no longer owns the first write.
	StateID *int
}

type CreateUserInput struct {
	Email    string
	Phone    string
	Password string
	// StateID threads the mandatory state selection from the register
	// handler through to the SQL INSERT. 0 means "not provided" (the
	// register handler already rejects <= 0 before calling Create).
	StateID int
}

type UpdateUserInput struct {
	DisplayName *string
	AvatarURL   *string
}

type Repository interface {
	Create(ctx context.Context, u *User) (*User, error)
	GetByID(ctx context.Context, id string) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	Update(ctx context.Context, u *User) (*User, error)
	MarkEmailVerified(ctx context.Context, id string) error
}

type Service interface {
	Create(ctx context.Context, input CreateUserInput) (*User, error)
	GetByID(ctx context.Context, id string) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	Update(ctx context.Context, id string, input UpdateUserInput) (*User, error)
	MarkEmailVerified(ctx context.Context, id string) error
}

type service struct {
	repo Repository
}

func NewService(repo Repository) Service {
	return &service{repo: repo}
}

func generateID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%x", b)
}

func (s *service) Create(ctx context.Context, input CreateUserInput) (*User, error) {
	u := &User{
		ID:    generateID(),
		Email: input.Email,
		Phone: input.Phone,
	}

	if input.StateID > 0 {
		sid := input.StateID
		u.StateID = &sid
	}

	if input.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("failed to hash password: %w", err)
		}
		hashStr := string(hash)
		u.PasswordHash = &hashStr
	}

	return s.repo.Create(ctx, u)
}

func (s *service) GetByID(ctx context.Context, id string) (*User, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *service) GetByEmail(ctx context.Context, email string) (*User, error) {
	return s.repo.GetByEmail(ctx, email)
}

func (s *service) Update(ctx context.Context, id string, input UpdateUserInput) (*User, error) {
	u, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if input.DisplayName != nil {
		u.DisplayName = *input.DisplayName
	}
	if input.AvatarURL != nil {
		u.AvatarURL = *input.AvatarURL
	}

	return s.repo.Update(ctx, u)
}

func (s *service) MarkEmailVerified(ctx context.Context, id string) error {
	return s.repo.MarkEmailVerified(ctx, id)
}
