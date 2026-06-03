package service

import (
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

func TestUniqueProofingAssetIDsDropsDuplicatesAndNil(t *testing.T) {
	a := uuid.New()
	b := uuid.New()

	got := uniqueProofingAssetIDs([]uuid.UUID{a, uuid.Nil, a, b, b})

	if len(got) != 2 {
		t.Fatalf("expected 2 unique asset ids, got %d: %v", len(got), got)
	}
	if got[0] != a || got[1] != b {
		t.Fatalf("expected stable unique order [%s %s], got %v", a, b, got)
	}
}

func TestValidProofingStatus(t *testing.T) {
	for _, status := range []string{"selected", "pending", "approved", "rejected", " approved "} {
		if !validProofingStatus(status) {
			t.Fatalf("expected %q to be valid", status)
		}
	}

	for _, status := range []string{"", "deleted", "complete", "approved; drop"} {
		if validProofingStatus(status) {
			t.Fatalf("expected %q to be invalid", status)
		}
	}
}

func TestSubmitPublicForGalleryRejectsUnavailableGalleryBeforeWriting(t *testing.T) {
	svc := NewProofingService(nil, nil)

	if err := svc.SubmitPublicForGallery(nil, nil, []string{uuid.NewString()}, "Client", "client@example.com", ""); err == nil || err.Error() != "gallery not found" {
		t.Fatalf("expected gallery not found, got %v", err)
	}

	gallery := &repository.Gallery{ID: uuid.New(), IsPublished: false}
	if err := svc.SubmitPublicForGallery(nil, gallery, []string{uuid.NewString()}, "Client", "client@example.com", ""); err == nil || err.Error() != "gallery is not published" {
		t.Fatalf("expected unpublished rejection, got %v", err)
	}

	past := time.Now().UTC().Add(-time.Minute)
	gallery.IsPublished = true
	gallery.ExpiresAt = &past
	if err := svc.SubmitPublicForGallery(nil, gallery, []string{uuid.NewString()}, "Client", "client@example.com", ""); err == nil || err.Error() != "gallery has expired" {
		t.Fatalf("expected expired rejection, got %v", err)
	}
}

func TestSubmitPublicForGalleryRejectsInvalidAssetIDBeforeRepoWrite(t *testing.T) {
	svc := NewProofingService(nil, nil)
	gallery := &repository.Gallery{ID: uuid.New(), IsPublished: true}

	err := svc.SubmitPublicForGallery(nil, gallery, []string{"not-a-uuid"}, "Client", "client@example.com", "")

	if err == nil || err.Error() != "invalid asset id: not-a-uuid" {
		t.Fatalf("expected invalid asset id error, got %v", err)
	}
}

func TestValidatePublicFavoriteRequest(t *testing.T) {
	svc := NewGalleryFavoritesService(nil, nil)

	if err := svc.validatePublicFavoriteRequest(nil, "guest"); !errors.Is(err, ErrGalleryFavoritesNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}

	gallery := &repository.Gallery{ID: uuid.New(), IsPublished: true}
	if err := svc.validatePublicFavoriteRequest(gallery, " "); !errors.Is(err, ErrGalleryFavoritesMissingSession) {
		t.Fatalf("expected missing session, got %v", err)
	}

	gallery.IsPublished = false
	if err := svc.validatePublicFavoriteRequest(gallery, "guest"); !errors.Is(err, ErrGalleryFavoritesNotPublished) {
		t.Fatalf("expected unpublished, got %v", err)
	}

	past := time.Now().UTC().Add(-time.Minute)
	gallery.IsPublished = true
	gallery.ExpiresAt = &past
	if err := svc.validatePublicFavoriteRequest(gallery, "guest"); !errors.Is(err, ErrGalleryFavoritesExpired) {
		t.Fatalf("expected expired, got %v", err)
	}

	gallery.ExpiresAt = nil
	if err := svc.validatePublicFavoriteRequest(gallery, " guest "); err != nil {
		t.Fatalf("expected valid request, got %v", err)
	}
}
