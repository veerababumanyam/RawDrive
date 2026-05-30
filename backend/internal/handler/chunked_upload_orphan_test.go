package handler

import (
	"context"
	"errors"
	"io"
	"testing"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

// F-005 regression coverage.
//
// finalizeUpload composes the multipart object in storage via
// CompleteMultipartUpload BEFORE it inserts the assets DB row. If that insert
// fails (a transient Postgres write error is enough) the fully-assembled
// object must be deleted, otherwise it is orphaned forever — the
// multipart-abort sweeper is a no-op once Complete has succeeded, so it can
// never reclaim the composed binary. The digest-mismatch and
// manifest-verification failure paths already delete the object; this guards
// the asset-insert failure path that previously did not.
//
// The asset insert goes through *repository.AssetRepo, a concrete type that
// cannot be made to fail in a unit test, so the create+cleanup branch is
// exercised through the persistAssetOrCleanup seam with a controllable create
// func and a delete-recording store.

// deleteRecordingStore is a minimal storage.Provider that records the keys
// passed to Delete so the test can assert the orphaned object was reclaimed.
type deleteRecordingStore struct {
	deleted   []string
	deleteErr error
}

func (s *deleteRecordingStore) Put(_ context.Context, _ string, _ io.Reader, _ int64, _ string) error {
	return errors.New("not implemented")
}

func (s *deleteRecordingStore) Get(_ context.Context, _ string) (io.ReadCloser, error) {
	return nil, errors.New("not implemented")
}

func (s *deleteRecordingStore) Delete(_ context.Context, key string) error {
	s.deleted = append(s.deleted, key)
	return s.deleteErr
}

func (s *deleteRecordingStore) PresignURL(_ context.Context, _ string, _ storage.PresignOptions) (string, error) {
	return "", errors.New("not implemented")
}

func (s *deleteRecordingStore) HealthCheck() storage.HealthStatus {
	return storage.HealthStatus{Status: "ok", Driver: "fake"}
}

var _ storage.Provider = (*deleteRecordingStore)(nil)

// TestF005_FinalizeAssetCreateFailureDeletesOrphanedObject is the RED→GREEN
// guard: a failing asset insert must trigger exactly one Delete of the
// assembled object's storage key, and the original create error must be
// surfaced (wrapped) to the caller. Before the fix the create-failure branch
// returned the error WITHOUT deleting, leaking the object — this test fails
// in that state because deleted would be empty.
func TestF005_FinalizeAssetCreateFailureDeletesOrphanedObject(t *testing.T) {
	store := &deleteRecordingStore{}

	const storageKey = "ws-123/up-456/original.bin"
	asset := &repository.Asset{StorageKey: storageKey}
	createErr := errors.New("transient postgres write failure")

	err := PersistAssetOrCleanupForTest(store, asset, storageKey,
		func(context.Context, *repository.Asset) error { return createErr })

	if err == nil {
		t.Fatalf("expected an error when asset create fails, got nil")
	}
	if !errors.Is(err, createErr) {
		t.Fatalf("expected the original create error to be wrapped and surfaced, got %v", err)
	}
	if len(store.deleted) != 1 {
		t.Fatalf("expected the assembled object to be deleted exactly once on create failure, got %d deletes: %v", len(store.deleted), store.deleted)
	}
	if store.deleted[0] != storageKey {
		t.Fatalf("expected delete of %q, got %q", storageKey, store.deleted[0])
	}
}

// TestF005_FinalizeAssetCreateSuccessKeepsObject is the negative control: on a
// successful insert the object must NOT be deleted, and no error returned.
// This guards against an over-eager fix that deletes on the happy path.
func TestF005_FinalizeAssetCreateSuccessKeepsObject(t *testing.T) {
	store := &deleteRecordingStore{}

	const storageKey = "ws-123/up-789/original.bin"
	asset := &repository.Asset{StorageKey: storageKey}

	err := PersistAssetOrCleanupForTest(store, asset, storageKey,
		func(context.Context, *repository.Asset) error { return nil })

	if err != nil {
		t.Fatalf("expected no error on successful asset create, got %v", err)
	}
	if len(store.deleted) != 0 {
		t.Fatalf("expected NO delete on successful asset create, got %v", store.deleted)
	}
}
