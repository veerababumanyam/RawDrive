package service

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

// TestF004_ChangeRoleRejectsSuperAdminEscalation is the regression test for
// F-004: AdminUserService.ChangeRole must validate the target role and refuse
// to promote any account to super_admin.
//
// The guard runs BEFORE the service touches userRepo, so a nil repo is a
// deliberate canary: if validation is removed (the pre-fix behavior), the call
// falls through to s.userRepo.UpdateRole and panics on the nil pointer, which
// recover() reports as a failure. With the guard in place, ChangeRole returns
// ErrInvalidRole without ever dereferencing the repo.
func TestF004_ChangeRoleRejectsSuperAdminEscalation(t *testing.T) {
	// nil userRepo / auditLog: a correctly-guarded ChangeRole must never reach
	// either of them on the rejection path.
	svc := NewAdminUserService(nil, nil, nil)

	target := uuid.New()
	actor := uuid.New()

	rejected := []string{
		"super_admin",
		"superadmin",
		"SUPER_ADMIN",
		"  super_admin  ",
		" SuperAdmin ",
		"owner",       // not in allowedCreateRoles
		"god",         // arbitrary junk
		"",            // empty
		"super-admin", // hyphen variant is not a valid role either
	}

	for _, role := range rejected {
		role := role
		t.Run("rejects_"+role, func(t *testing.T) {
			err := callChangeRole(t, svc, target, role, actor)
			if !errors.Is(err, ErrInvalidRole) {
				t.Fatalf("ChangeRole(%q) = %v, want ErrInvalidRole (escalation/invalid role must be refused before touching the repo)", role, err)
			}
		})
	}
}

// TestF004_ChangeRoleCannotChangeOwnRole preserves the existing self-change
// guard so the F-004 fix did not regress it.
func TestF004_ChangeRoleCannotChangeOwnRole(t *testing.T) {
	svc := NewAdminUserService(nil, nil, nil)
	id := uuid.New()

	err := callChangeRole(t, svc, id, "admin", id)
	if err == nil {
		t.Fatal("ChangeRole on self returned nil, want self-change rejection")
	}
	if errors.Is(err, ErrInvalidRole) {
		t.Fatalf("ChangeRole on self returned ErrInvalidRole, want the self-change error; got %v", err)
	}
}

// callChangeRole invokes ChangeRole and converts a nil-pointer panic (the
// pre-fix fall-through to userRepo.UpdateRole) into a test failure, so the
// regression is observable without a backing database.
func callChangeRole(t *testing.T, svc *AdminUserService, id uuid.UUID, role string, actor uuid.UUID) (err error) {
	t.Helper()
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("ChangeRole(%q) panicked (validation missing — fell through to repo): %v", role, r)
		}
	}()
	return svc.ChangeRole(context.Background(), id, role, actor)
}
