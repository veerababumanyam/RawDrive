package user

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"

	"golang.org/x/crypto/bcrypt"

	"github.com/rawdrive/backend/internal/passwordpolicy"
)

var (
	ErrConflict = errors.New("conflict: resource already exists")
	ErrNotFound = errors.New("not found")
	// ErrPhoneTaken distinguishes phone-uniqueness violations from
	// generic DB errors so the register handler can respond with a
	// targeted 409 + actionable message instead of an opaque 500.
	// The email uniqueness path is handled upstream by the register
	// handler's FindByEmail pre-check; phone has no analogous
	// pre-check (users don't always supply it), so the repo must
	// detect the constraint-name-specific 23505 at INSERT time.
	ErrPhoneTaken = errors.New("phone number is already registered")
)

const maxPasswordLen = passwordpolicy.MaxBcryptInputBytes

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
	StateID            *int
	District           *string
	MustChangePassword bool // set true for admin-created dealer accounts until first password change
	// PhoneReuseState is the phone-reuse lifecycle state (phone-reuse epic):
	// free | paid_pending | paid_active | paid_expired. Empty is treated as
	// "free" by the repo. The DB CHECK (migration 172) and the partial unique
	// index (migration 173) enforce the invariants.
	PhoneReuseState string
}

type CreateUserInput struct {
	Email       string
	Phone       string
	Password    string
	DisplayName string
	StateID     *int
	District    string
	// PhoneReuseState lets the caller create an account in a non-free reuse
	// state (e.g. "paid_pending" for a paid signup on an already-used phone).
	// Empty defaults to "free".
	PhoneReuseState string
}

type UpdateUserInput struct {
	DisplayName *string
	AvatarURL   *string
	Phone       *string
	StateID     *int
	District    *string
}

type Repository interface {
	Create(ctx context.Context, u *User) (*User, error)
	GetByID(ctx context.Context, id string) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	Update(ctx context.Context, u *User) (*User, error)
	MarkEmailVerified(ctx context.Context, id string) error
	// UpdatePasswordByID replaces the user's password hash and optionally
	// clears the must_change_password flag. Used by the change-password flow.
	UpdatePasswordByID(ctx context.Context, id, hashedPassword string, mustChange bool) error
	// ExistsByNormalizedPhone reports whether ANY account already holds the
	// given canonical phone identity (any reuse state). Used by registration to
	// decide free-vs-paid_pending routing before the INSERT. normalized "" is
	// always (false, nil) — a phoneless lookup matches nobody.
	ExistsByNormalizedPhone(ctx context.Context, normalized string) (bool, error)
}

type Service interface {
	Create(ctx context.Context, input CreateUserInput) (*User, error)
	GetByID(ctx context.Context, id string) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	Update(ctx context.Context, id string, input UpdateUserInput) (*User, error)
	MarkEmailVerified(ctx context.Context, id string) error
	ChangePassword(ctx context.Context, userID, currentPassword, newPassword string) error
	// PhoneInUse reports whether the given canonical phone identity already
	// belongs to an account (any reuse state).
	PhoneInUse(ctx context.Context, normalized string) (bool, error)
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
		ID:              generateID(),
		Email:           input.Email,
		Phone:           input.Phone,
		DisplayName:     input.DisplayName,
		StateID:         input.StateID,
		PhoneReuseState: input.PhoneReuseState,
	}
	if input.District != "" {
		u.District = &input.District
	}

	if input.Password != "" {
		if err := passwordpolicy.ValidateBcryptInput("password", input.Password); err != nil {
			return nil, err
		}
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
	if input.Phone != nil {
		u.Phone = *input.Phone
	}
	if input.StateID != nil {
		u.StateID = input.StateID
	}
	if input.District != nil {
		u.District = input.District
	}

	return s.repo.Update(ctx, u)
}

func (s *service) MarkEmailVerified(ctx context.Context, id string) error {
	return s.repo.MarkEmailVerified(ctx, id)
}

// PhoneInUse reports whether the canonical phone identity already belongs to an
// account (any reuse state). Empty normalized matches nobody.
func (s *service) PhoneInUse(ctx context.Context, normalized string) (bool, error) {
	if normalized == "" {
		return false, nil
	}
	return s.repo.ExistsByNormalizedPhone(ctx, normalized)
}

// ChangePassword verifies currentPassword against the stored hash, checks
// complexity of newPassword, then replaces the hash and clears the
// must_change_password flag.
func (s *service) ChangePassword(ctx context.Context, userID, currentPassword, newPassword string) error {
	u, err := s.repo.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if u.PasswordHash == nil {
		return errors.New("wrong current password")
	}
	if bcrypt.CompareHashAndPassword([]byte(*u.PasswordHash), []byte(currentPassword)) != nil {
		return errors.New("wrong current password")
	}
	if err := validatePasswordComplexity(newPassword); err != nil {
		return err
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(newPassword), 12)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}
	return s.repo.UpdatePasswordByID(ctx, userID, string(hashed), false)
}

// validatePasswordComplexity enforces >=12 chars, upper, lower, digit, special.
func validatePasswordComplexity(pw string) error {
	if len(pw) < 12 {
		return errors.New("password does not meet complexity requirements")
	}
	if !passwordpolicy.FitsBcrypt(pw) {
		return errors.New("password does not meet complexity requirements")
	}
	var hasUpper, hasLower, hasDigit, hasSpecial bool
	for _, c := range pw {
		switch {
		case c >= 'A' && c <= 'Z':
			hasUpper = true
		case c >= 'a' && c <= 'z':
			hasLower = true
		case c >= '0' && c <= '9':
			hasDigit = true
		default:
			hasSpecial = true
		}
	}
	if !(hasUpper && hasLower && hasDigit && hasSpecial) {
		return errors.New("password does not meet complexity requirements")
	}
	return nil
}
