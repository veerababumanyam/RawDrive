package service

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestGalleryAccessSetPassword_RejectsOverlongPasswordBeforeHash(t *testing.T) {
	svc := NewGalleryAccessService(nil, nil)

	err := svc.SetPassword(context.Background(), uuid.New(), "Aa1!"+strings.Repeat("x", 69))

	if err == nil {
		t.Fatal("expected overlong gallery password to be rejected")
	}
	if !strings.Contains(err.Error(), "at most 72") {
		t.Fatalf("expected friendly length error, got %v", err)
	}
}

func TestShareLinkCreate_RejectsOverlongPINBeforeHash(t *testing.T) {
	svc := NewShareLinkService(nil)

	_, err := svc.Create(context.Background(), CreateShareLinkInput{
		GalleryID: uuid.New(),
		PIN:       strings.Repeat("1", 73),
	})

	if err == nil {
		t.Fatal("expected overlong share-link PIN to be rejected")
	}
	if !strings.Contains(err.Error(), "at most 72") {
		t.Fatalf("expected friendly length error, got %v", err)
	}
}
