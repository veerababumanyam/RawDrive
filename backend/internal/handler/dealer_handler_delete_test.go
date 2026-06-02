package handler

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// M39 E7-S2 GREEN: dealer soft-delete + q search contract assertions.
// These tests assert that the production symbols introduced for E7-S2 exist
// with the expected shapes. Runtime integration (real DB + HTTP) is covered
// by m39_migrations_test.go + e2e Playwright specs in round 4.

func TestDealer_HasDeletedAtField(t *testing.T) {
	var d repository.Dealer
	// Must compile: DeletedAt is a *time.Time pointer.
	d.DeletedAt = nil
	if d.DeletedAt != nil {
		t.Fatalf("expected zero-value Dealer.DeletedAt to be nil, got %v", d.DeletedAt)
	}
}

func TestDealerFilter_HasQAndIncludeDeletedFields(t *testing.T) {
	f := repository.DealerFilter{Q: "acme", IncludeDeleted: false}
	if f.Q != "acme" {
		t.Fatalf("expected DealerFilter.Q to round-trip; got %q", f.Q)
	}
	if f.IncludeDeleted {
		t.Fatalf("expected DealerFilter.IncludeDeleted default false after explicit false, got true")
	}
}

func TestDealerRepo_SoftDelete_MethodExists(t *testing.T) {
	// Guard test: method signature is (ctx, uuid.UUID) -> (bool, error).
	// Using a typed nil receiver to avoid a real DB dependency here; any
	// actual call would panic, so we only reference the method to ensure
	// the signature compiles.
	var repo *repository.DealerRepo
	_ = repo
	var _ func() = func() {
		_, _ = repo.SoftDelete(context.TODO(), uuid.Nil)
	}
}

func TestDealerService_ErrDealerAlreadyDeleted_Defined(t *testing.T) {
	// SEC-F06 requirement: admin DELETE on already-deleted dealer must map
	// to 409. Sentinel must be exported and distinct from ErrDealerNotFound.
	if service.ErrDealerAlreadyDeleted == nil {
		t.Fatal("service.ErrDealerAlreadyDeleted must be a non-nil sentinel error")
	}
	if errors.Is(service.ErrDealerAlreadyDeleted, service.ErrDealerNotFound) {
		t.Fatal("ErrDealerAlreadyDeleted must not be the same as ErrDealerNotFound")
	}
}

func TestDealerHandler_WithAuditLog_IsFluent(t *testing.T) {
	svc := service.NewDealerService(nil)
	h := NewDealerHandler(svc).WithAuditLog(nil)
	if h == nil {
		t.Fatal("WithAuditLog must return the handler (fluent)")
	}
	// Delete method must be exported and callable (signature check only).
	_ = h.Delete
}
