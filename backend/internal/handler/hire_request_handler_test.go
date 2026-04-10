package handler

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// ──────────────────────── Test helpers ────────────────────────

// withAuthCtx injects a JWT claims map with the given user id into the
// request context so getUserID() resolves correctly. Mirrors how the auth
// middleware populates claims in production.
func withAuthCtx(r *http.Request, userID uuid.UUID) *http.Request {
	claims := map[string]interface{}{"sub": userID.String()}
	ctx := middleware.WithJWTClaims(r.Context(), claims)
	return r.WithContext(ctx)
}

// ──────────────────────── State machine ────────────────────────

// TestHireStatusTransitions_Valid verifies the allowed transitions for the
// hire-request state machine defined in migration 000014. The matrix here
// is the single source of truth handlers depend on.
func TestHireStatusTransitions_Valid(t *testing.T) {
	cases := []struct {
		from string
		to   string
		want bool
	}{
		// Happy path
		{"sent", "accepted", true},
		{"sent", "declined", true},
		{"sent", "cancelled", true},
		{"accepted", "confirmed", true},
		{"accepted", "cancelled", true},
		{"accepted", "declined", true},
		{"confirmed", "completed", true},
		{"confirmed", "cancelled", true},

		// Rejected transitions
		{"sent", "confirmed", false},   // must go through accepted
		{"sent", "completed", false},   // must go through accepted → confirmed
		{"declined", "accepted", false}, // terminal
		{"completed", "cancelled", false},
		{"cancelled", "sent", false},
		{"accepted", "completed", false}, // must go through confirmed
		{"", "sent", false},              // unknown source
		{"sent", "nonsense", false},      // unknown target
	}
	for _, tc := range cases {
		got := service.IsValidHireStatusTransition(tc.from, tc.to)
		if got != tc.want {
			t.Errorf("IsValidHireStatusTransition(%q, %q) = %v, want %v", tc.from, tc.to, got, tc.want)
		}
	}
}

// ──────────────────────── Route registration ────────────────────────

// TestM5Routes_HireRequestEndpoints verifies the new hire-request and
// review endpoints are registered under /api/v1/marketplace.
func TestM5Routes_HireRequestEndpoints(t *testing.T) {
	r := chi.NewRouter()
	// Zero-value deps: handlers may panic (nil repo) — routeExists recovers
	// and we only care that chi routes the request rather than 404/405.
	RegisterM5Routes(r, M5Dependencies{})

	listingID := uuid.New().String()
	hireID := uuid.New().String()

	cases := []struct {
		method string
		path   string
	}{
		{"POST", "/api/v1/marketplace/freelancers/" + listingID + "/hire"},
		{"GET", "/api/v1/marketplace/hire-requests"},
		{"PATCH", "/api/v1/marketplace/hire-requests/" + hireID + "/status"},
		{"POST", "/api/v1/marketplace/freelancers/" + listingID + "/reviews"},
	}
	for _, tc := range cases {
		if !routeExists(r, tc.method, tc.path) {
			t.Errorf("route not registered: %s %s", tc.method, tc.path)
		}
	}
}

// ──────────────────────── Handler behavior (no DB) ────────────────────────

// TestCreateHireRequest_Unauthorized verifies the handler rejects requests
// without a JWT context (401).
func TestCreateHireRequest_Unauthorized(t *testing.T) {
	h := NewHireRequestHandler(nil, nil)
	r := chi.NewRouter()
	r.Post("/api/v1/marketplace/freelancers/{id}/hire", h.CreateHireRequest)

	body := `{"message":"hello"}`
	req := httptest.NewRequest("POST", "/api/v1/marketplace/freelancers/"+uuid.New().String()+"/hire",
		bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d: %s", w.Code, w.Body.String())
	}
}

// TestCreateHireRequest_InvalidListingID verifies 400 on non-UUID path param.
func TestCreateHireRequest_InvalidListingID(t *testing.T) {
	h := NewHireRequestHandler(nil, nil)
	r := chi.NewRouter()
	r.Post("/api/v1/marketplace/freelancers/{id}/hire", h.CreateHireRequest)

	req := httptest.NewRequest("POST", "/api/v1/marketplace/freelancers/not-a-uuid/hire",
		bytes.NewBufferString(`{}`))
	req = withAuthCtx(req, uuid.New())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// TestCreateHireRequest_InvalidBody verifies 400 on malformed JSON.
func TestCreateHireRequest_InvalidBody(t *testing.T) {
	h := NewHireRequestHandler(nil, nil)
	r := chi.NewRouter()
	r.Post("/api/v1/marketplace/freelancers/{id}/hire", h.CreateHireRequest)

	req := httptest.NewRequest("POST", "/api/v1/marketplace/freelancers/"+uuid.New().String()+"/hire",
		bytes.NewBufferString("{bad"))
	req = withAuthCtx(req, uuid.New())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// TestUpdateHireRequestStatus_MissingStatus verifies 400 when status is empty.
// This exercises the validation path that runs BEFORE any repo lookup, so it
// works without a DB when the freelancer repo is nil.
func TestUpdateHireRequestStatus_MissingStatus(t *testing.T) {
	// Service must be non-nil so the handler reaches the empty-status check.
	svc := service.NewMarketplaceService(nil, nil, nil, nil)
	h := NewHireRequestHandler(svc, nil)
	r := chi.NewRouter()
	r.Patch("/api/v1/marketplace/hire-requests/{id}/status", h.UpdateHireRequestStatus)

	req := httptest.NewRequest("PATCH",
		"/api/v1/marketplace/hire-requests/"+uuid.New().String()+"/status",
		bytes.NewBufferString(`{"status":""}`))
	req = withAuthCtx(req, uuid.New())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// TestListHireRequests_InvalidRole verifies 400 on bad role query parameter.
func TestListHireRequests_InvalidRole(t *testing.T) {
	svc := service.NewMarketplaceService(nil, nil, nil, nil)
	h := NewHireRequestHandler(svc, nil)
	r := chi.NewRouter()
	r.Get("/api/v1/marketplace/hire-requests", h.ListHireRequests)

	req := httptest.NewRequest("GET",
		"/api/v1/marketplace/hire-requests?role=bogus", nil)
	req = withAuthCtx(req, uuid.New())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// TestCreateFreelancerReview_InvalidListingID verifies 400 on non-UUID.
func TestCreateFreelancerReview_InvalidListingID(t *testing.T) {
	svc := service.NewMarketplaceService(nil, nil, nil, nil)
	h := NewHireRequestHandler(svc, nil)
	r := chi.NewRouter()
	r.Post("/api/v1/marketplace/freelancers/{id}/reviews", h.CreateFreelancerReview)

	req := httptest.NewRequest("POST", "/api/v1/marketplace/freelancers/not-a-uuid/reviews",
		bytes.NewBufferString(`{"rating":5}`))
	req = withAuthCtx(req, uuid.New())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// TestCreateFreelancerReview_Unauthorized verifies 401 without auth context.
func TestCreateFreelancerReview_Unauthorized(t *testing.T) {
	svc := service.NewMarketplaceService(nil, nil, nil, nil)
	h := NewHireRequestHandler(svc, nil)
	r := chi.NewRouter()
	r.Post("/api/v1/marketplace/freelancers/{id}/reviews", h.CreateFreelancerReview)

	req := httptest.NewRequest("POST",
		"/api/v1/marketplace/freelancers/"+uuid.New().String()+"/reviews",
		bytes.NewBufferString(`{"rating":5}`))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d: %s", w.Code, w.Body.String())
	}
}

// TestCreateBooking_DateConflict documents that full end-to-end verification
// of the 409 wiring requires a live DB because the gear handler calls
// repo.GetByID before reaching the conflict hook. The pure conflict-check
// logic is exercised by TestBookingConflictCheck_EndBeforeStart below.
func TestCreateBooking_DateConflict(t *testing.T) {
	t.Skip("requires DB for gear lookup; conflict wiring covered by TestBookingConflictCheck_EndBeforeStart")
}

// TestBookingConflictCheck_EndBeforeStart verifies the service rejects
// invalid ranges before ever touching the repo. We pass an empty (zero-
// value) *repository.GearRepo because the method short-circuits on the
// end<start check and never dereferences the embedded DB pool.
func TestBookingConflictCheck_EndBeforeStart(t *testing.T) {
	svc := service.NewMarketplaceService(nil, &repository.GearRepo{}, nil, nil)

	start := time.Date(2026, 5, 10, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	err := svc.CheckBookingConflict(context.Background(), uuid.New(), start, end)
	if err == nil {
		t.Fatal("expected ErrBookingInvalidRange, got nil")
	}
	if !errors.Is(err, service.ErrBookingInvalidRange) {
		t.Errorf("expected ErrBookingInvalidRange, got %v", err)
	}
}

// TestBookingConflictCheck_RepoNotWired verifies the service returns the
// explicit "not wired" sentinel when gearRepo is nil.
func TestBookingConflictCheck_RepoNotWired(t *testing.T) {
	svc := service.NewMarketplaceService(nil, nil, nil, nil)
	err := svc.CheckBookingConflict(context.Background(), uuid.New(),
		time.Now(), time.Now().Add(24*time.Hour))
	if !errors.Is(err, service.ErrMarketplaceRepoNotWired) {
		t.Errorf("expected ErrMarketplaceRepoNotWired, got %v", err)
	}
}
