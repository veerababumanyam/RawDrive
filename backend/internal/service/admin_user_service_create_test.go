package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// M39 E5-S1 GREEN: AdminUserService.Create contract assertions.
//
// Full integration (real Postgres insert, Mailpit delivery, audit row) is
// exercised by existing admin integration suites + round-4 Playwright; these
// unit tests guard the validation / routing contract at the service layer
// with nil repo (we only reach validation before the repo call).

func TestAdminUserService_Create_InvalidEmailRejected(t *testing.T) {
	svc := &AdminUserService{}
	_, err := svc.Create(context.Background(), CreateInput{
		Email:   "not-an-email",
		Role:    "photographer",
		ActorID: uuid.New(),
	})
	if err != ErrInvalidEmail {
		t.Fatalf("expected ErrInvalidEmail, got %v", err)
	}
}

func TestAdminUserService_Create_SuperadminRejected(t *testing.T) {
	svc := &AdminUserService{}
	_, err := svc.Create(context.Background(), CreateInput{
		Email:   "u@example.com",
		Role:    "superadmin",
		ActorID: uuid.New(),
	})
	if err != ErrInvalidRole {
		t.Fatalf("expected ErrInvalidRole for superadmin, got %v", err)
	}
}

func TestAdminUserService_Create_SuperAdminUnderscoreRejected(t *testing.T) {
	svc := &AdminUserService{}
	_, err := svc.Create(context.Background(), CreateInput{
		Email:   "u@example.com",
		Role:    "super_admin",
		ActorID: uuid.New(),
	})
	if err != ErrInvalidRole {
		t.Fatalf("expected ErrInvalidRole for super_admin, got %v", err)
	}
}

func TestAdminUserService_Create_UnknownRoleRejected(t *testing.T) {
	svc := &AdminUserService{}
	_, err := svc.Create(context.Background(), CreateInput{
		Email:   "u@example.com",
		Role:    "galactic-emperor",
		ActorID: uuid.New(),
	})
	if err != ErrInvalidRole {
		t.Fatalf("expected ErrInvalidRole for unknown role, got %v", err)
	}
}

func TestAdminUserService_Create_MissingActorRejected(t *testing.T) {
	svc := &AdminUserService{}
	_, err := svc.Create(context.Background(), CreateInput{
		Email: "u@example.com",
		Role:  "photographer",
	})
	if err != ErrMissingActor {
		t.Fatalf("expected ErrMissingActor, got %v", err)
	}
}

func TestAdminUserService_Create_WeakPasswordRejected(t *testing.T) {
	svc := &AdminUserService{}
	weak := "short"
	_, err := svc.Create(context.Background(), CreateInput{
		Email:           "u@example.com",
		Role:            "photographer",
		InitialPassword: &weak,
		ActorID:         uuid.New(),
	})
	if err != ErrWeakPassword {
		t.Fatalf("expected ErrWeakPassword, got %v", err)
	}
}

func TestAdminUserService_Create_MissingPathRejected(t *testing.T) {
	svc := &AdminUserService{}
	_, err := svc.Create(context.Background(), CreateInput{
		Email:   "u@example.com",
		Role:    "photographer",
		ActorID: uuid.New(),
	})
	if err != ErrMissingPasswordOrInvite {
		t.Fatalf("expected ErrMissingPasswordOrInvite, got %v", err)
	}
}

func TestAdminUserService_Create_AdminRoleAllowed_EvenPasswordPath(t *testing.T) {
	// Passes validation and reaches repo step (which returns error due to
	// nil repo). We only care that validation succeeded (not ErrInvalidRole).
	svc := &AdminUserService{}
	strong := "SuperStr0ng!Pass"
	_, err := svc.Create(context.Background(), CreateInput{
		Email:           "admin@example.com",
		Role:            "admin",
		InitialPassword: &strong,
		ActorID:         uuid.New(),
	})
	if err == ErrInvalidRole {
		t.Fatalf("admin role must be allowed by the whitelist, got ErrInvalidRole")
	}
	// Any non-ErrInvalidRole / non-ErrWeakPassword result means validation passed.
	if err == nil {
		t.Fatal("expected repo-not-configured error (nil repo), got nil")
	}
}

// QA #44: 'user' and 'customer' are NOT valid platform roles (migration 035
// CHECK constraint forbids them). The previous whitelist mistakenly allowed
// them, which would have failed the INSERT with a constraint violation.
func TestAdminUserService_Create_UserRoleRejected(t *testing.T) {
	svc := &AdminUserService{}
	_, err := svc.Create(context.Background(), CreateInput{
		Email:   "u@example.com",
		Role:    "user",
		ActorID: uuid.New(),
	})
	if err != ErrInvalidRole {
		t.Fatalf("expected ErrInvalidRole for role='user' (not in DB CHECK), got %v", err)
	}
}

func TestAdminUserService_Create_CustomerRoleRejected(t *testing.T) {
	svc := &AdminUserService{}
	_, err := svc.Create(context.Background(), CreateInput{
		Email:   "c@example.com",
		Role:    "customer",
		ActorID: uuid.New(),
	})
	if err != ErrInvalidRole {
		t.Fatalf("expected ErrInvalidRole for role='customer' (not in DB CHECK), got %v", err)
	}
}

func TestAdminUserService_Create_TeamMemberAndClientAllowed(t *testing.T) {
	svc := &AdminUserService{}
	strong := "SuperStr0ng!Pass"
	for _, role := range []string{"team_member", "client"} {
		_, err := svc.Create(context.Background(), CreateInput{
			Email:           role + "@example.com",
			Role:            role,
			InitialPassword: &strong,
			ActorID:         uuid.New(),
		})
		if err == ErrInvalidRole {
			t.Errorf("role=%q must pass the whitelist, got ErrInvalidRole", role)
		}
	}
}

func TestValidatePasswordComplexity_MixedRequired(t *testing.T) {
	tests := []struct {
		pw   string
		want error
	}{
		{"short", ErrWeakPassword},
		{"allLowercase12345", ErrWeakPassword},  // no upper, no special
		{"ALLUPPERCASE1234!", ErrWeakPassword},  // no lower
		{"NoDigitsHere!Pass", ErrWeakPassword},  // no digit
		{"NoSpecial1234Pass", ErrWeakPassword},  // no special
		{"Str0ng!PassWord", nil},
	}
	for _, tc := range tests {
		if got := validatePasswordComplexity(tc.pw); got != tc.want {
			t.Errorf("validatePasswordComplexity(%q) = %v, want %v", tc.pw, got, tc.want)
		}
	}
}
