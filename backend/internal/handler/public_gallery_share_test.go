package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// fakeShareSource is an in-memory shareSessionSource for the S4-G2 tests. It
// models the authoritative ShareLinkService.ValidateAccess outcome (expired /
// wrong-PIN / exhausted -> deny) and records whether TrackAccess committed.
type fakeShareSource struct {
	galleryID uuid.UUID
	validErr  error // non-nil -> ValidateAccess returns (false, err)
	valid     bool  // ValidateAccess result when validErr is nil
	tracked   int
	trackErr  error
}

func (f *fakeShareSource) GalleryIDForToken(_ context.Context, token string) (uuid.UUID, error) {
	if token == "" {
		return uuid.Nil, errors.New("share link not found")
	}
	return f.galleryID, nil
}

func (f *fakeShareSource) ValidateAccess(_ context.Context, _, _ string) (bool, error) {
	if f.validErr != nil {
		return false, f.validErr
	}
	return f.valid, nil
}

func (f *fakeShareSource) TrackAccess(_ context.Context, _ string) (int, error) {
	if f.trackErr != nil {
		return 0, f.trackErr
	}
	f.tracked++
	return f.tracked, nil
}

func newShareGatedHandler(t *testing.T, src shareSessionSource) (*PublicGalleryHandler, *service.GalleryAccessService) {
	t.Helper()
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(0x40 + i)
	}
	accessSvc := service.NewGalleryAccessService(nil, nil).WithSessionSigningKey(key)
	h := NewPublicGalleryHandler(nil, nil, nil).
		WithGalleryAccessService(accessSvc).
		WithShareSessionSource(src)
	return h, accessSvc
}

func privateGallery() *repository.Gallery {
	return &repository.Gallery{ID: uuid.New(), Title: "Private Gallery", IsPublished: true, AccessMode: "private"}
}

// TestShare_ValidLink_BindsSessionAndAllows (S4-G2) — a valid share link for
// this gallery validates, commits access, mints a durable session cookie, and
// unlocks a private gallery.
func TestShare_ValidLink_BindsSessionAndAllows(t *testing.T) {
	g := privateGallery()
	src := &fakeShareSource{galleryID: g.ID, valid: true}
	h, _ := newShareGatedHandler(t, src)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets?share=good-token", nil)
	if !h.gateGalleryAccess(rec, req, g) {
		t.Fatalf("valid share link must unlock the private gallery (status=%d)", rec.Code)
	}
	if src.tracked != 1 {
		t.Fatalf("valid share access must be committed via TrackAccess once, got %d", src.tracked)
	}
	// A durable session cookie must be set so follow-up asset/byte calls carry it.
	if c := rec.Result().Cookies(); len(c) == 0 || c[0].Name != "gallery_session" || c[0].Value == "" {
		t.Fatal("a gallery_session cookie must be minted on share bind")
	}
}

// TestShare_ExpiredLink_Denied (S4-G2) — an expired/wrong-PIN link (modelled by
// ValidateAccess returning an error) yields NO session and must not unlock the
// gallery, and must NOT commit an access.
func TestShare_ExpiredLink_Denied(t *testing.T) {
	g := privateGallery()
	src := &fakeShareSource{galleryID: g.ID, validErr: errors.New("share link expired")}
	h, _ := newShareGatedHandler(t, src)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets?share=expired-token", nil)
	if h.gateGalleryAccess(rec, req, g) {
		t.Fatal("expired share link must NOT unlock the gallery")
	}
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for a private gallery with an expired share link, got %d", rec.Code)
	}
	if src.tracked != 0 {
		t.Fatalf("a failed share validation must NOT commit an access, got %d", src.tracked)
	}
}

// TestShare_WrongPIN_Denied (S4-G2) — ValidateAccess returning (false, nil)
// (the wrong-PIN case for AccessPIN mode) yields no session.
func TestShare_WrongPIN_Denied(t *testing.T) {
	g := privateGallery()
	src := &fakeShareSource{galleryID: g.ID, valid: false}
	h, _ := newShareGatedHandler(t, src)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets?share=tok&share_pin=0000", nil)
	if h.gateGalleryAccess(rec, req, g) {
		t.Fatal("wrong-PIN share link must NOT unlock the gallery")
	}
	if src.tracked != 0 {
		t.Fatalf("wrong-PIN must NOT commit an access, got %d", src.tracked)
	}
}

// TestShare_TokenForOtherGallery_Denied (S4-G2) — a share token bound to a
// different gallery must not unlock this one even if presented in the URL.
func TestShare_TokenForOtherGallery_Denied(t *testing.T) {
	g := privateGallery()
	src := &fakeShareSource{galleryID: uuid.New(), valid: true} // bound elsewhere
	h, _ := newShareGatedHandler(t, src)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets?share=tok", nil)
	if h.gateGalleryAccess(rec, req, g) {
		t.Fatal("a share token bound to another gallery must not unlock this one")
	}
	if src.tracked != 0 {
		t.Fatalf("mismatched gallery binding must NOT commit an access, got %d", src.tracked)
	}
}

// TestShare_ExhaustedLink_DeniedOnPublicGalleryToo (S4-G2) — even on a public
// gallery a presented-but-exhausted share link simply doesn't bind a session.
// The public gallery still serves anonymously (regression guard), and no
// access is committed for the failed share.
func TestShare_ExhaustedLink_PublicStillServesAnon(t *testing.T) {
	g := publishedPublicGallery()
	src := &fakeShareSource{galleryID: g.ID, validErr: errors.New("share link access limit reached")}
	h, _ := newShareGatedHandler(t, src)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets?share=exhausted", nil)
	if !h.gateGalleryAccess(rec, req, g) {
		t.Fatalf("public gallery must still serve anonymously regardless of a bad share link (status=%d)", rec.Code)
	}
	if src.tracked != 0 {
		t.Fatalf("exhausted share link must NOT commit an access, got %d", src.tracked)
	}
}
