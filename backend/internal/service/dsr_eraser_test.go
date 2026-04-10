package service

// dsr_eraser_test.go — unit tests for the portions of DSREraser that do
// not require a live Postgres instance. DB-touching behaviour is covered
// by the integration test under internal/database (which runs against a
// testcontainer), but these tests guard the input validation, storage
// fan-out, and signature contract that the worker depends on.

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

// fakeDeleter captures every Delete() call so tests can assert the
// eraser dispatched the right keys in the right order.
type fakeDeleter struct {
	deleted   []string
	failOn    map[string]error
	callCount int
}

func (f *fakeDeleter) Delete(_ context.Context, key string) error {
	f.callCount++
	if err, ok := f.failOn[key]; ok {
		return err
	}
	f.deleted = append(f.deleted, key)
	return nil
}

// TestDSREraser_Erase_RejectsEmptyInput ensures the eraser refuses to
// run when it has no subject identity. This is the guard that prevents
// a buggy caller from accidentally purging the entire database.
func TestDSREraser_Erase_RejectsEmptyInput(t *testing.T) {
	e := NewDSREraser(nil, &fakeDeleter{})
	err := e.Erase(context.Background(), "", nil)
	if err == nil {
		t.Fatal("expected error for empty email + nil userID, got nil")
	}
}

// TestDSREraser_Erase_RequiresPool ensures the eraser fails fast when
// the caller forgot to pass a DB pool. Without this check we'd get a
// nil-pointer panic on the first query.
func TestDSREraser_Erase_RequiresPool(t *testing.T) {
	e := NewDSREraser(nil, &fakeDeleter{})
	uid := uuid.New()
	err := e.Erase(context.Background(), "subject@example.com", &uid)
	if err == nil {
		t.Fatal("expected error when pool is nil, got nil")
	}
}

// TestDSREraser_NewDSREraser_PermitsNilStorage verifies that tests and
// environments without an R2 client can still construct an eraser. The
// runtime warns but does not crash.
func TestDSREraser_NewDSREraser_PermitsNilStorage(t *testing.T) {
	// Should not panic.
	e := NewDSREraser(nil, nil)
	if e == nil {
		t.Fatal("NewDSREraser returned nil")
	}
	if e.storage != nil {
		t.Errorf("expected nil storage, got %v", e.storage)
	}
}

// TestDSREraser_DeleteStorageObjects_CountsOnlySuccesses verifies that
// the best-effort delete loop increments the success counter only for
// keys that deleted cleanly. This matters because the counter is logged
// as a compliance audit trail.
func TestDSREraser_DeleteStorageObjects_CountsOnlySuccesses(t *testing.T) {
	deleter := &fakeDeleter{
		failOn: map[string]error{
			"bucket/failing-key": errors.New("r2 503"),
		},
	}
	e := &DSREraser{storage: deleter}

	keys := []string{
		"bucket/good-1.jpg",
		"bucket/failing-key",
		"bucket/good-2.jpg",
	}
	got := e.deleteStorageObjects(context.Background(), keys)

	if got != 2 {
		t.Errorf("expected 2 successful deletes, got %d", got)
	}
	if deleter.callCount != 3 {
		t.Errorf("expected 3 delete calls, got %d", deleter.callCount)
	}
	if len(deleter.deleted) != 2 {
		t.Errorf("expected 2 recorded successes, got %d", len(deleter.deleted))
	}
}

// TestDSREraser_DeleteStorageObjects_HandlesEmptyList verifies the zero
// case — no keys → no calls → zero successes — without error.
func TestDSREraser_DeleteStorageObjects_HandlesEmptyList(t *testing.T) {
	deleter := &fakeDeleter{}
	e := &DSREraser{storage: deleter}

	got := e.deleteStorageObjects(context.Background(), nil)

	if got != 0 {
		t.Errorf("expected 0 for empty list, got %d", got)
	}
	if deleter.callCount != 0 {
		t.Errorf("expected 0 calls for empty list, got %d", deleter.callCount)
	}
}

// TestStorageDeleter_Contract ensures the StorageDeleter interface has
// the exact shape the eraser expects. A regression here — e.g., adding
// a second argument to Delete — would silently break the production
// wiring, so we enforce it at compile time with this assignment.
func TestStorageDeleter_Contract(t *testing.T) {
	var _ StorageDeleter = &fakeDeleter{}
}
