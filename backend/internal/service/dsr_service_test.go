package service

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

// fakeDSRStore is an in-memory DSRPersister for tests.
type fakeDSRStore struct {
	mu        sync.Mutex
	rows      map[uuid.UUID]*DSRRequest
	createErr error
}

func newFakeDSRStore() *fakeDSRStore {
	return &fakeDSRStore{rows: make(map[uuid.UUID]*DSRRequest)}
}

func (f *fakeDSRStore) Create(_ context.Context, req *DSRRequest) error {
	if f.createErr != nil {
		return f.createErr
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	cp := *req
	f.rows[req.ID] = &cp
	return nil
}

func (f *fakeDSRStore) GetByID(_ context.Context, id uuid.UUID) (*DSRRequest, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	r, ok := f.rows[id]
	if !ok {
		return nil, nil
	}
	cp := *r
	return &cp, nil
}

func (f *fakeDSRStore) UpdateStatus(_ context.Context, id uuid.UUID, status DSRStatus, payload json.RawMessage, failureReason string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	r, ok := f.rows[id]
	if !ok {
		return errors.New("not found")
	}
	r.Status = status
	if payload != nil {
		r.ExportPayload = payload
	}
	r.FailureReason = failureReason
	if status == DSRStatusCompleted {
		now := time.Now()
		r.CompletedAt = &now
	}
	return nil
}

func (f *fakeDSRStore) FindRecentBySubject(_ context.Context, email string, since time.Time) ([]*DSRRequest, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []*DSRRequest
	for _, r := range f.rows {
		if r.SubjectEmail == email && r.RequestedAt.After(since) {
			cp := *r
			out = append(out, &cp)
		}
	}
	return out, nil
}

// fakeExporter returns a fixed bundle for tests.
type fakeExporter struct {
	bundle    map[string]any
	returnErr error
	called    bool
}

func (f *fakeExporter) ExportSubjectData(_ context.Context, email string, userID *uuid.UUID) (map[string]any, error) {
	f.called = true
	if f.returnErr != nil {
		return nil, f.returnErr
	}
	return f.bundle, nil
}

// TestDSR_SubmitRequest_HappyPath verifies a fresh access request is
// persisted in pending state.
func TestDSR_SubmitRequest_HappyPath(t *testing.T) {
	store := newFakeDSRStore()
	svc := NewDSRService(store)

	req, err := svc.SubmitRequest(context.Background(), "veera@example.com", nil, DSRTypeAccess)
	if err != nil {
		t.Fatalf("SubmitRequest: %v", err)
	}
	if req.Status != DSRStatusPending {
		t.Errorf("status: want %s, got %s", DSRStatusPending, req.Status)
	}
	if req.ID == uuid.Nil {
		t.Error("expected non-nil ID")
	}
	if len(store.rows) != 1 {
		t.Errorf("expected 1 row, got %d", len(store.rows))
	}
}

// TestDSR_SubmitRequest_RejectsEmptyEmail verifies email validation.
func TestDSR_SubmitRequest_RejectsEmptyEmail(t *testing.T) {
	svc := NewDSRService(newFakeDSRStore())
	_, err := svc.SubmitRequest(context.Background(), "", nil, DSRTypeAccess)
	if !errors.Is(err, ErrDSRInvalidEmail) {
		t.Errorf("want ErrDSRInvalidEmail, got %v", err)
	}
}

// TestDSR_SubmitRequest_RejectsInvalidType verifies type validation.
func TestDSR_SubmitRequest_RejectsInvalidType(t *testing.T) {
	svc := NewDSRService(newFakeDSRStore())
	_, err := svc.SubmitRequest(context.Background(), "v@e.com", nil, "invalid")
	if !errors.Is(err, ErrDSRInvalidType) {
		t.Errorf("want ErrDSRInvalidType, got %v", err)
	}
}

// TestDSR_SubmitRequest_RejectsDuplicate verifies the 24h dedup window.
func TestDSR_SubmitRequest_RejectsDuplicate(t *testing.T) {
	store := newFakeDSRStore()
	svc := NewDSRService(store)

	_, err := svc.SubmitRequest(context.Background(), "v@e.com", nil, DSRTypeAccess)
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.SubmitRequest(context.Background(), "v@e.com", nil, DSRTypeAccess)
	if !errors.Is(err, ErrDSRDuplicate) {
		t.Errorf("want ErrDSRDuplicate, got %v", err)
	}
}

// TestDSR_SubmitRequest_DifferentTypesAllowed verifies that erasure +
// access can both be submitted concurrently.
func TestDSR_SubmitRequest_DifferentTypesAllowed(t *testing.T) {
	store := newFakeDSRStore()
	svc := NewDSRService(store)

	if _, err := svc.SubmitRequest(context.Background(), "v@e.com", nil, DSRTypeAccess); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SubmitRequest(context.Background(), "v@e.com", nil, DSRTypeErasure); err != nil {
		t.Errorf("erasure after access should be allowed, got %v", err)
	}
}

// TestDSR_ProcessAccess_BuildsExportBundle verifies the happy path.
func TestDSR_ProcessAccess_BuildsExportBundle(t *testing.T) {
	store := newFakeDSRStore()
	exporter := &fakeExporter{bundle: map[string]any{
		"users":     []any{map[string]any{"id": "u1", "email": "veera@e.com"}},
		"galleries": []any{map[string]any{"id": "g1"}},
	}}
	svc := NewDSRService(store).WithExporter(exporter)

	req, err := svc.SubmitRequest(context.Background(), "veera@e.com", nil, DSRTypeAccess)
	if err != nil {
		t.Fatal(err)
	}
	completed, err := svc.ProcessAccessRequest(context.Background(), req.ID)
	if err != nil {
		t.Fatalf("ProcessAccessRequest: %v", err)
	}
	if completed.Status != DSRStatusCompleted {
		t.Errorf("status: want completed, got %s", completed.Status)
	}
	if !exporter.called {
		t.Error("exporter was not called")
	}
	if len(completed.ExportPayload) == 0 {
		t.Error("export payload is empty")
	}
	if completed.CompletedAt == nil {
		t.Error("completed_at not set")
	}
}

// TestDSR_ProcessAccess_FailsWithoutExporter verifies that missing
// exporter wiring produces a clean failure rather than an empty bundle.
func TestDSR_ProcessAccess_FailsWithoutExporter(t *testing.T) {
	store := newFakeDSRStore()
	svc := NewDSRService(store) // no .WithExporter

	req, _ := svc.SubmitRequest(context.Background(), "v@e.com", nil, DSRTypeAccess)
	_, err := svc.ProcessAccessRequest(context.Background(), req.ID)
	if !errors.Is(err, ErrDSRExporterNotSet) {
		t.Errorf("want ErrDSRExporterNotSet, got %v", err)
	}

	// Verify the row was marked failed.
	r, _ := store.GetByID(context.Background(), req.ID)
	if r.Status != DSRStatusFailed {
		t.Errorf("status: want failed, got %s", r.Status)
	}
}

// TestDSR_ProcessAccess_Idempotent verifies re-processing a completed
// request doesn't re-run the exporter.
func TestDSR_ProcessAccess_Idempotent(t *testing.T) {
	store := newFakeDSRStore()
	exporter := &fakeExporter{bundle: map[string]any{"users": []any{}}}
	svc := NewDSRService(store).WithExporter(exporter)

	req, _ := svc.SubmitRequest(context.Background(), "v@e.com", nil, DSRTypeAccess)
	if _, err := svc.ProcessAccessRequest(context.Background(), req.ID); err != nil {
		t.Fatal(err)
	}
	exporter.called = false
	if _, err := svc.ProcessAccessRequest(context.Background(), req.ID); err != nil {
		t.Fatal(err)
	}
	if exporter.called {
		t.Error("exporter should not have been called again on completed request")
	}
}

// TestDSR_GetRequest_NotFound verifies proper error for unknown IDs.
func TestDSR_GetRequest_NotFound(t *testing.T) {
	svc := NewDSRService(newFakeDSRStore())
	_, err := svc.GetRequest(context.Background(), uuid.New())
	if !errors.Is(err, ErrDSRNotFound) {
		t.Errorf("want ErrDSRNotFound, got %v", err)
	}
}
