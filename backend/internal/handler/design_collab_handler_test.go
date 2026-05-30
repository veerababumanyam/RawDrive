package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
)

// F-057 regression: the collab handlers used to read claims["user_id"],
// claims["full_name"] and claims["avatar_url"] — none of which exist in the
// JWT claims map (middleware.JWTAuth only sets sub/workspace_id/role/
// platform_role/state_id/mfa_verified). As a result every JoinSession /
// AcquireLock attributed the action to "" (which downstream parsed to
// uuid.Nil) with a blank display name/avatar. The fix reads claims["sub"]
// for the user id and sources display fields from a profile lookup.

const collabTestUserID = "22222222-2222-2222-2222-222222222222"

// fakeProfileLookup is a deterministic CollabProfileLookup for unit tests.
type fakeProfileLookup struct {
	name   string
	avatar string
	gotID  string
}

func (f *fakeProfileLookup) DisplayProfile(_ context.Context, userID string) (string, string) {
	f.gotID = userID
	return f.name, f.avatar
}

// newCollabRequest builds a request carrying a JWT "sub" claim plus the chi
// {id} URL param, matching how the router invokes these handlers.
func newCollabRequest(method, path, galleryID string, body []byte) *http.Request {
	var r *http.Request
	if body != nil {
		r = httptest.NewRequest(method, path, bytes.NewReader(body))
	} else {
		r = httptest.NewRequest(method, path, nil)
	}
	// Only "sub" is set — mirroring the real JWT claims map. If the handler
	// (incorrectly) read "user_id"/"full_name"/"avatar_url", they would be
	// absent and resolve to empty strings.
	r = r.WithContext(middleware.WithJWTClaims(r.Context(), map[string]interface{}{
		"sub": collabTestUserID,
	}))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", galleryID)
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
	return r
}

// TestF057_JoinSession_AttributesRealUserFromSub verifies presence is keyed by
// the authenticated user's "sub" claim (not the absent "user_id") and that the
// display name/avatar come from the profile lookup (not absent claims).
func TestF057_JoinSession_AttributesRealUserFromSub(t *testing.T) {
	svc := service.NewDesignCollabService(nil) // nil NATS conn — broadcasts are no-ops
	profiles := &fakeProfileLookup{name: "Aarav Mehta", avatar: "https://cdn.example/a.png"}
	h := NewDesignCollabHandler(svc).WithProfileLookup(profiles)

	const galleryID = "gallery-abc"
	req := newCollabRequest(http.MethodPost, "/api/v1/galleries/"+galleryID+"/collab/join", galleryID, nil)
	rec := httptest.NewRecorder()

	h.JoinSession(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("JoinSession status = %d, want 200 (body=%q)", rec.Code, rec.Body.String())
	}

	presence := svc.GetPresence(galleryID)
	if len(presence) != 1 {
		t.Fatalf("presence count = %d, want 1", len(presence))
	}
	p := presence[0]

	// Pre-fix this was "" (from the absent claims["user_id"]).
	if p.UserID != collabTestUserID {
		t.Errorf("presence UserID = %q, want %q (must come from claims[\"sub\"])", p.UserID, collabTestUserID)
	}
	// Pre-fix this was "" (from the absent claims["full_name"]).
	if p.UserName != "Aarav Mehta" {
		t.Errorf("presence UserName = %q, want %q (must come from profile lookup)", p.UserName, "Aarav Mehta")
	}
	// Pre-fix this was "" (from the absent claims["avatar_url"]).
	if p.AvatarURL != "https://cdn.example/a.png" {
		t.Errorf("presence AvatarURL = %q, want %q (must come from profile lookup)", p.AvatarURL, "https://cdn.example/a.png")
	}
	// The profile lookup must be queried with the real user id.
	if profiles.gotID != collabTestUserID {
		t.Errorf("profile lookup queried with %q, want %q", profiles.gotID, collabTestUserID)
	}
}

// TestF057_AcquireLock_AttributesRealUserFromSub verifies lock ownership is
// recorded against the authenticated "sub" user with a non-empty display name.
func TestF057_AcquireLock_AttributesRealUserFromSub(t *testing.T) {
	svc := service.NewDesignCollabService(nil)
	profiles := &fakeProfileLookup{name: "Priya Nair", avatar: ""}
	h := NewDesignCollabHandler(svc).WithProfileLookup(profiles)

	const galleryID = "gallery-xyz"
	body, _ := json.Marshal(map[string]string{"section_id": "hero"})
	req := newCollabRequest(http.MethodPost, "/api/v1/galleries/"+galleryID+"/collab/lock", galleryID, body)
	rec := httptest.NewRecorder()

	h.AcquireLock(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("AcquireLock status = %d, want 200 (body=%q)", rec.Code, rec.Body.String())
	}

	locks := svc.GetLocks(galleryID)
	if len(locks) != 1 {
		t.Fatalf("lock count = %d, want 1", len(locks))
	}
	lock := locks[0]

	if lock.LockedBy != collabTestUserID {
		t.Errorf("lock LockedBy = %q, want %q (must come from claims[\"sub\"])", lock.LockedBy, collabTestUserID)
	}
	if lock.UserName != "Priya Nair" {
		t.Errorf("lock UserName = %q, want %q (must come from profile lookup)", lock.UserName, "Priya Nair")
	}
}

// TestF057_ReleaseLock_UsesSubOwnership verifies a user can release a lock they
// acquired — ownership is matched on the "sub" id end to end. Pre-fix both the
// acquire and release paths used "" so this passed only by accident (Nil==Nil);
// the assertion below pins the real-id ownership semantics.
func TestF057_ReleaseLock_UsesSubOwnership(t *testing.T) {
	svc := service.NewDesignCollabService(nil)
	h := NewDesignCollabHandler(svc) // no profile lookup — display fields irrelevant here

	const galleryID = "gallery-rel"

	// Acquire as the real sub user.
	body, _ := json.Marshal(map[string]string{"section_id": "footer"})
	acqReq := newCollabRequest(http.MethodPost, "/api/v1/galleries/"+galleryID+"/collab/lock", galleryID, body)
	h.AcquireLock(httptest.NewRecorder(), acqReq)

	if got := len(svc.GetLocks(galleryID)); got != 1 {
		t.Fatalf("after acquire: lock count = %d, want 1", got)
	}

	// Release with {sectionId} param + same sub.
	relReq := newCollabRequest(http.MethodDelete, "/api/v1/galleries/"+galleryID+"/collab/lock/footer", galleryID, nil)
	rctx := chi.RouteContext(relReq.Context())
	rctx.URLParams.Add("sectionId", "footer")
	relRec := httptest.NewRecorder()

	h.ReleaseLock(relRec, relReq)

	if relRec.Code != http.StatusOK {
		t.Fatalf("ReleaseLock status = %d, want 200", relRec.Code)
	}
	if got := len(svc.GetLocks(galleryID)); got != 0 {
		t.Fatalf("after release: lock count = %d, want 0 (sub-owned lock should be released)", got)
	}
}

// TestF057_NilProfileLookup_DegradesToEmptyDisplay confirms the handler still
// attributes the correct user id when no profile lookup is wired (current
// production wiring), degrading display fields to empty rather than panicking.
func TestF057_NilProfileLookup_DegradesToEmptyDisplay(t *testing.T) {
	svc := service.NewDesignCollabService(nil)
	h := NewDesignCollabHandler(svc) // profiles == nil

	const galleryID = "gallery-nilprofile"
	req := newCollabRequest(http.MethodPost, "/api/v1/galleries/"+galleryID+"/collab/join", galleryID, nil)
	rec := httptest.NewRecorder()

	h.JoinSession(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("JoinSession status = %d, want 200", rec.Code)
	}
	presence := svc.GetPresence(galleryID)
	if len(presence) != 1 {
		t.Fatalf("presence count = %d, want 1", len(presence))
	}
	// User id must still be correct even without a profile lookup.
	if presence[0].UserID != collabTestUserID {
		t.Errorf("presence UserID = %q, want %q", presence[0].UserID, collabTestUserID)
	}
	if presence[0].UserName != "" || presence[0].AvatarURL != "" {
		t.Errorf("display fields = (%q,%q), want empty without a profile lookup", presence[0].UserName, presence[0].AvatarURL)
	}
}
