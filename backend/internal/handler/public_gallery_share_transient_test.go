package handler

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// transientShareSource is a shareSessionSource whose GalleryIDForToken /
// ValidateAccess can be made to fail with a TRANSIENT (ErrShareLinkUnavailable)
// or a GENUINE error, so the handler's 503-vs-403 behaviour can be asserted
// without a DB. It also records TrackAccess commits to prove a transient
// failure never grants access.
type transientShareSource struct {
	galleryID    uuid.UUID
	galleryIDErr error // returned by GalleryIDForToken (nil => returns galleryID)
	validateErr  error // returned by ValidateAccess (nil => returns valid)
	valid        bool
	trackErr     error
	tracked      int
}

func (s *transientShareSource) GalleryIDForToken(_ context.Context, token string) (uuid.UUID, error) {
	if s.galleryIDErr != nil {
		return uuid.Nil, s.galleryIDErr
	}
	if token == "" {
		return uuid.Nil, fmt.Errorf("share link not found")
	}
	return s.galleryID, nil
}

func (s *transientShareSource) ValidateAccess(_ context.Context, _, _ string) (bool, error) {
	if s.validateErr != nil {
		return false, s.validateErr
	}
	return s.valid, nil
}

func (s *transientShareSource) TrackAccess(_ context.Context, _ string) (int, error) {
	if s.trackErr != nil {
		return 0, s.trackErr
	}
	s.tracked++
	return s.tracked, nil
}

// TestGate_TransientShareLookupError_Returns503 — a TRANSIENT DB error during
// share-link binding (surfaced as ErrShareLinkUnavailable) must DENY but with a
// RETRYABLE 503, not a permanent 403. This is the issue #179 regression guard:
// the SSR page can retry instead of hard-500ing on a momentary blip. Access is
// still denied (gate returns false) and no access is committed.
func TestGate_TransientShareLookupError_Returns503(t *testing.T) {
	g := privateGallery()
	src := &transientShareSource{
		galleryID:    g.ID,
		galleryIDErr: fmt.Errorf("%w: connection reset", service.ErrShareLinkUnavailable),
	}
	h, _ := newShareGatedHandler(t, src)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets?share=tok", nil)
	if h.gateGalleryAccess(rec, req, g) {
		t.Fatal("a transient share-lookup failure must NOT grant access")
	}
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 (retryable) on a transient share-lookup error, got %d", rec.Code)
	}
	if src.tracked != 0 {
		t.Fatalf("a transient failure must NOT commit an access, got %d", src.tracked)
	}
}

// TestGate_TransientValidateAccessError_Returns503 — same as above but the
// transient error surfaces from ValidateAccess (the authoritative gate) rather
// than the binding lookup. Still 503, still denied, still no commit.
func TestGate_TransientValidateAccessError_Returns503(t *testing.T) {
	g := privateGallery()
	src := &transientShareSource{
		galleryID:   g.ID,
		validateErr: fmt.Errorf("%w: server closed the connection", service.ErrShareLinkUnavailable),
	}
	h, _ := newShareGatedHandler(t, src)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets?share=tok", nil)
	if h.gateGalleryAccess(rec, req, g) {
		t.Fatal("a transient ValidateAccess failure must NOT grant access")
	}
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 (retryable) on a transient ValidateAccess error, got %d", rec.Code)
	}
	if src.tracked != 0 {
		t.Fatalf("a transient failure must NOT commit an access, got %d", src.tracked)
	}
}

// TestGate_TransientTrackAccessError_Returns503 — a transient (non-limit)
// TrackAccess DB error after a successful pre-flight must also yield a retryable
// 503, never a 403, and never a granted session.
func TestGate_TransientTrackAccessError_Returns503(t *testing.T) {
	g := privateGallery()
	src := &transientShareSource{
		galleryID: g.ID,
		valid:     true,
		trackErr:  errors.New("share link increment access: deadlock detected"),
	}
	h, _ := newShareGatedHandler(t, src)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets?share=tok", nil)
	if h.gateGalleryAccess(rec, req, g) {
		t.Fatal("a transient TrackAccess failure must NOT grant access")
	}
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 (retryable) on a transient TrackAccess error, got %d", rec.Code)
	}
}

// TestGate_ExhaustedTrackAccess_StaysGenuineDenial — when TrackAccess reports
// ErrAccessLimitExceeded (the link was exhausted by a concurrent access between
// pre-flight and commit), that is a GENUINE denial, not transient: a private
// gallery stays 403, NOT 503.
func TestGate_ExhaustedTrackAccess_StaysGenuineDenial(t *testing.T) {
	g := privateGallery()
	src := &transientShareSource{
		galleryID: g.ID,
		valid:     true,
		trackErr:  service.ErrAccessLimitExceeded,
	}
	h, _ := newShareGatedHandler(t, src)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets?share=tok", nil)
	if h.gateGalleryAccess(rec, req, g) {
		t.Fatal("an exhausted share link must NOT grant access")
	}
	if rec.Code != http.StatusForbidden {
		t.Fatalf("an exhausted (genuine) denial must stay 403, got %d", rec.Code)
	}
}

// TestGate_GenuineNotFoundShareLink_StaysForbidden — a GENUINE not-found share
// token (no transient signal) on a private gallery must stay a permanent 403,
// never get softened to 503.
func TestGate_GenuineNotFoundShareLink_StaysForbidden(t *testing.T) {
	g := privateGallery()
	src := &transientShareSource{
		galleryID:    g.ID,
		galleryIDErr: errors.New("share link not found"), // plain, NOT ErrShareLinkUnavailable
	}
	h, _ := newShareGatedHandler(t, src)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets?share=tok", nil)
	if h.gateGalleryAccess(rec, req, g) {
		t.Fatal("a genuine not-found share link must NOT grant access")
	}
	if rec.Code != http.StatusForbidden {
		t.Fatalf("a genuine not-found denial must stay 403, got %d", rec.Code)
	}
}

// TestGate_TransientShareError_PublicGalleryStillServes — a transient share blip
// on an OPEN public gallery must not break anonymous delivery. The gallery is
// independently reachable (no session required), so the gate still returns true
// and serves anonymously; the transient share signal only matters for gated
// galleries where the share link was the access path.
func TestGate_TransientShareError_PublicGalleryStillServes(t *testing.T) {
	g := publishedPublicGallery() // open public gallery
	src := &transientShareSource{
		galleryID:    g.ID,
		galleryIDErr: fmt.Errorf("%w: connection reset", service.ErrShareLinkUnavailable),
	}
	h, _ := newShareGatedHandler(t, src)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets?share=tok", nil)
	if !h.gateGalleryAccess(rec, req, g) {
		t.Fatalf("an open public gallery must still serve anonymously despite a transient share blip (status=%d)", rec.Code)
	}
}

// ensure repository import is used even if the file evolves.
var _ = repository.ShareLink{}
