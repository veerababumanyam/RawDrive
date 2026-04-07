package user

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
)

var (
	ErrConflict = errors.New("conflict: resource already exists")
	ErrNotFound = errors.New("not found")
)

type User struct {
	ID          string
	Email       string
	Phone       string
	DisplayName string
	AvatarURL   string
}

type CreateUserInput struct {
	Email string
	Phone string
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
}

type Service interface {
	Create(ctx context.Context, input CreateUserInput) (*User, error)
	GetByID(ctx context.Context, id string) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	Update(ctx context.Context, id string, input UpdateUserInput) (*User, error)
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
