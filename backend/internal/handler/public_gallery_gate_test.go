package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// ptr returns a pointer to s — keeps the gallery literals below terse.
func strptr(s string) *string { return &s }

// newGatedHandler builds a PublicGalleryHandler wired with a signed gallery
// access service (the durable session path). No DB is touched — gateGalleryAccess
// receives the gallery object directly.
func newGatedHandler(t *testing.T) (*PublicGalleryHandler, *service.GalleryAccessService) {
	t.Helper()
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}
	accessSvc := service.NewGalleryAccessService(nil, nil).WithSessionSigningKey(key)
	h := NewPublicGalleryHandler(nil, nil, nil).WithGalleryAccessService(accessSvc)
	return h, accessSvc
}

func publishedPublicGallery() *repository.Gallery {
	return &repository.Gallery{
		ID:          uuid.New(),
		Title:       "Open Wedding Gallery",
		IsPublished: true,
		AccessMode:  "public",
	}
}

// TestGate_PublicGallery_AnonymousAllowed is the REGRESSION GUARD: a published,
// non-expired, non-password, public gallery must still serve to anonymous
// clients. Breaking this breaks normal delivery (S4-G1 critical constraint).
func TestGate_PublicGallery_AnonymousAllowed(t *testing.T) {
	h, _ := newGatedHandler(t)
	g := publishedPublicGallery()

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/public/galleries/x/assets", nil)
	if !h.gateGalleryAccess(rec, req, g) {
		t.Fatalf("anonymous access to a public published gallery must be allowed (status=%d)", rec.Code)
	}
}

func TestGate_UnlistedGallery_AnonymousAllowed(t *testing.T) {
	h, _ := newGatedHandler(t)
	g := publishedPublicGallery()
	g.AccessMode = "unlisted"

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets", nil)
	if !h.gateGalleryAccess(rec, req, g) {
		t.Fatalf("unlisted galleries are reachable by direct slug (status=%d)", rec.Code)
	}
}

// TestGate_Unpublished_Denied — an unpublished gallery is never served.
func TestGate_Unpublished_Denied(t *testing.T) {
	h, _ := newGatedHandler(t)
	g := publishedPublicGallery()
	g.IsPublished = false

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets", nil)
	if h.gateGalleryAccess(rec, req, g) {
		t.Fatal("unpublished gallery must be denied")
	}
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unpublished, got %d", rec.Code)
	}
}

// TestGate_Expired_Denied — an expired gallery returns 410 and is denied.
func TestGate_Expired_Denied(t *testing.T) {
	h, _ := newGatedHandler(t)
	g := publishedPublicGallery()
	past := time.Now().UTC().Add(-time.Hour)
	g.ExpiresAt = &past

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets", nil)
	if h.gateGalleryAccess(rec, req, g) {
		t.Fatal("expired gallery must be denied")
	}
	if rec.Code != http.StatusGone {
		t.Fatalf("expected 410 for expired, got %d", rec.Code)
	}
}

// TestGate_PasswordProtected_NoSession_Denied (S4-G1/G2) — a password gallery
// without a session returns 401.
func TestGate_PasswordProtected_NoSession_Denied(t *testing.T) {
	h, _ := newGatedHandler(t)
	g := publishedPublicGallery()
	g.PasswordHash = strptr("$2a$10$abcdefghijklmnopqrstuv")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets", nil)
	if h.gateGalleryAccess(rec, req, g) {
		t.Fatal("password-protected gallery must be denied without a session")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

// TestGate_PasswordProtected_ValidSession_Allowed (S4-G1/G2) — a valid
// password session (header form) unlocks the gallery.
func TestGate_PasswordProtected_ValidSession_Allowed(t *testing.T) {
	h, accessSvc := newGatedHandler(t)
	g := publishedPublicGallery()
	g.PasswordHash = strptr("$2a$10$abcdefghijklmnopqrstuv")

	// Mint a password-scoped session for this gallery (as VerifyPassword would).
	token, err := accessSvc.IssueShareSession(g.ID, "") // share/password share the issuer path
	if err != nil {
		t.Fatalf("issue session: %v", err)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets", nil)
	req.Header.Set("X-Gallery-Session", token)
	if !h.gateGalleryAccess(rec, req, g) {
		t.Fatalf("valid session must unlock the gallery (status=%d)", rec.Code)
	}
}

// TestGate_PasswordProtected_CookieSession_Allowed — same as above but via the
// gallery_session cookie (browser path).
func TestGate_PasswordProtected_CookieSession_Allowed(t *testing.T) {
	h, accessSvc := newGatedHandler(t)
	g := publishedPublicGallery()
	g.PasswordHash = strptr("$2a$10$abcdefghijklmnopqrstuv")

	token, err := accessSvc.IssueShareSession(g.ID, "")
	if err != nil {
		t.Fatalf("issue session: %v", err)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets", nil)
	req.AddCookie(&http.Cookie{Name: "gallery_session", Value: token})
	if !h.gateGalleryAccess(rec, req, g) {
		t.Fatalf("valid cookie session must unlock the gallery (status=%d)", rec.Code)
	}
}

// TestGate_Private_NoSession_Denied (S4-G3) — a published 'private' gallery
// with no session returns 403, even without a password.
func TestGate_Private_NoSession_Denied(t *testing.T) {
	h, _ := newGatedHandler(t)
	g := publishedPublicGallery()
	g.AccessMode = "private"
	g.PasswordHash = nil // no password — still gated by access_mode

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets", nil)
	if h.gateGalleryAccess(rec, req, g) {
		t.Fatal("private gallery must be denied without a session")
	}
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

func TestGate_InviteOnly_NoSession_Denied(t *testing.T) {
	h, _ := newGatedHandler(t)
	g := publishedPublicGallery()
	g.AccessMode = "invite-only"

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets", nil)
	if h.gateGalleryAccess(rec, req, g) {
		t.Fatal("invite-only gallery must be denied without a session")
	}
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

// TestGate_Private_ValidSession_Allowed (S4-G3) — a valid share/invite session
// unlocks a private gallery.
func TestGate_Private_ValidSession_Allowed(t *testing.T) {
	h, accessSvc := newGatedHandler(t)
	g := publishedPublicGallery()
	g.AccessMode = "private"

	token, err := accessSvc.IssueShareSession(g.ID, "share-token-abc")
	if err != nil {
		t.Fatalf("issue share session: %v", err)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets", nil)
	req.Header.Set("X-Gallery-Session", token)
	if !h.gateGalleryAccess(rec, req, g) {
		t.Fatalf("valid share session must unlock a private gallery (status=%d)", rec.Code)
	}
}

// TestGate_SessionForOtherGallery_Denied — a session bound to gallery B must
// not unlock gallery A (cross-gallery binding).
func TestGate_SessionForOtherGallery_Denied(t *testing.T) {
	h, accessSvc := newGatedHandler(t)
	g := publishedPublicGallery()
	g.AccessMode = "private"

	// Session minted for a DIFFERENT gallery.
	token, err := accessSvc.IssueShareSession(uuid.New(), "share-token-other")
	if err != nil {
		t.Fatalf("issue share session: %v", err)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x/assets", nil)
	req.Header.Set("X-Gallery-Session", token)
	if h.gateGalleryAccess(rec, req, g) {
		t.Fatal("a session for another gallery must not unlock this one")
	}
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}
