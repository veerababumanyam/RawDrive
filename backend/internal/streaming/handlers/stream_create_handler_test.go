package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/streaming/cf"
	"github.com/rawdrive/backend/internal/streaming/credit"
)

// --- Fakes ---

type fakeCreditService struct {
	reserveCalled int32
	releaseCalled int32
	reserveErr    error
	reservation   *credit.Reservation
}

func (f *fakeCreditService) ReserveCredits(_ context.Context, in credit.ReserveInput) (*credit.Reservation, error) {
	atomic.AddInt32(&f.reserveCalled, 1)
	if f.reserveErr != nil {
		return nil, f.reserveErr
	}
	return f.reservation, nil
}

func (f *fakeCreditService) RefundReservation(_ context.Context, in credit.RefundInput) (*credit.LedgerEntry, error) {
	atomic.AddInt32(&f.releaseCalled, 1)
	return &credit.LedgerEntry{}, nil
}

type fakeCFClient struct {
	createCalled int32
	createErr    error
	liveInput    *cf.LiveInput
}

func (f *fakeCFClient) Create(_ context.Context, _ map[string]string) (*cf.LiveInput, error) {
	atomic.AddInt32(&f.createCalled, 1)
	if f.createErr != nil {
		return nil, f.createErr
	}
	return f.liveInput, nil
}
func (f *fakeCFClient) Update(_ context.Context, _ string, _ cf.LiveInputPatch) (*cf.LiveInput, error) {
	return f.liveInput, nil
}
func (f *fakeCFClient) Disable(_ context.Context, _ string) error { return nil }
func (f *fakeCFClient) Delete(_ context.Context, _ string) error  { return nil }
func (f *fakeCFClient) Get(_ context.Context, _ string) (*cf.LiveInput, error) {
	return f.liveInput, nil
}

type fakeStreamWriter struct {
	inserted  *StreamCreateInput
	insertErr error
}

func (f *fakeStreamWriter) CreateStream(_ context.Context, in StreamCreateInput) (uuid.UUID, error) {
	if f.insertErr != nil {
		return uuid.Nil, f.insertErr
	}
	f.inserted = &in
	return uuid.New(), nil
}

type fakeShortlinker struct {
	code string
	err  error
}

func (f *fakeShortlinker) Generate(_ context.Context, _ uuid.UUID, _ uuid.UUID) (string, error) {
	return f.code, f.err
}

// --- helpers ---

func validCreateBody(t *testing.T, pkgID uuid.UUID) []byte {
	t.Helper()
	body := map[string]any{
		"title":                     "My Stream",
		"package_id":                pkgID.String(),
		"expected_duration_minutes": 60,
		"access_policy":             "pin",
		"chat_policy":               "authenticated",
		"timezone":                  "Asia/Kolkata",
		"idempotency_key":           uuid.New().String(),
	}
	b, _ := json.Marshal(body)
	return b
}

func mountCreateRouter(h *StreamCreateHandler) http.Handler {
	r := chi.NewRouter()
	r.Post("/api/v1/streaming/streams", h.Create)
	return r
}

func newFakeCreateDeps() (*fakeCreditService, *fakeCFClient, *fakeStreamWriter, *fakeShortlinker, *fakeFlag) {
	ws := uuid.New()
	return &fakeCreditService{
			reservation: &credit.Reservation{
				ID:              uuid.New(),
				WorkspaceID:     ws,
				ReservedMinutes: 60,
				State:           credit.ReservationPending,
			},
		},
		&fakeCFClient{liveInput: &cf.LiveInput{UID: "cf-uid-123", RTMPSURL: "rtmps://x", StreamKey: "sk"}},
		&fakeStreamWriter{},
		&fakeShortlinker{code: "abc123"},
		&fakeFlag{enabled: true}
}

func TestStreamCreate_Unauthenticated_401(t *testing.T) {
	cs, cfc, sw, sl, ff := newFakeCreateDeps()
	h := NewStreamCreateHandler(StreamCreateDeps{
		Credit: cs, CF: cfc, Writer: sw, Shortlink: sl, Flag: ff,
		Clock: func() time.Time { return time.Now() },
	})
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/streaming/streams",
		strings.NewReader(string(validCreateBody(t, uuid.New()))))
	req.Header.Set("Content-Type", "application/json")
	mountCreateRouter(h).ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 got %d", rr.Code)
	}
}

func TestStreamCreate_InvalidPayload_400(t *testing.T) {
	cs, cfc, sw, sl, ff := newFakeCreateDeps()
	h := NewStreamCreateHandler(StreamCreateDeps{
		Credit: cs, CF: cfc, Writer: sw, Shortlink: sl, Flag: ff,
		Clock: func() time.Time { return time.Now() },
	})

	cases := []struct {
		name string
		body map[string]any
	}{
		{"missing package_id", map[string]any{
			"title": "t", "expected_duration_minutes": 60,
			"access_policy": "pin", "chat_policy": "authenticated",
			"timezone": "Asia/Kolkata", "idempotency_key": uuid.New().String(),
		}},
		{"invalid timezone", map[string]any{
			"title": "t", "package_id": uuid.New().String(), "expected_duration_minutes": 60,
			"access_policy": "pin", "chat_policy": "authenticated",
			"timezone": "Not/A_Zone", "idempotency_key": uuid.New().String(),
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			b, _ := json.Marshal(tc.body)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/streaming/streams", strings.NewReader(string(b)))
			req.Header.Set("Content-Type", "application/json")
			req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(uuid.New().String(), "photographer")))
			rr := httptest.NewRecorder()
			mountCreateRouter(h).ServeHTTP(rr, req)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("%s: want 400 got %d body=%s", tc.name, rr.Code, rr.Body.String())
			}
		})
	}
}

func TestStreamCreate_InsufficientCredits_402(t *testing.T) {
	cs, cfc, sw, sl, ff := newFakeCreateDeps()
	cs.reserveErr = credit.ErrInsufficient
	h := NewStreamCreateHandler(StreamCreateDeps{
		Credit: cs, CF: cfc, Writer: sw, Shortlink: sl, Flag: ff,
		Clock: func() time.Time { return time.Now() },
	})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/streaming/streams",
		strings.NewReader(string(validCreateBody(t, uuid.New()))))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(uuid.New().String(), "photographer")))
	rr := httptest.NewRecorder()
	mountCreateRouter(h).ServeHTTP(rr, req)
	if rr.Code != http.StatusPaymentRequired {
		t.Fatalf("want 402 got %d body=%s", rr.Code, rr.Body.String())
	}
	if atomic.LoadInt32(&cfc.createCalled) != 0 {
		t.Fatalf("CF must NOT be called when reserve fails")
	}
}

func TestStreamCreate_ValidRequest_201_ReturnsStreamIDAndAccessPolicy(t *testing.T) {
	cs, cfc, sw, sl, ff := newFakeCreateDeps()
	h := NewStreamCreateHandler(StreamCreateDeps{
		Credit: cs, CF: cfc, Writer: sw, Shortlink: sl, Flag: ff,
		Clock: func() time.Time { return time.Now() },
	})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/streaming/streams",
		strings.NewReader(string(validCreateBody(t, uuid.New()))))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(uuid.New().String(), "photographer")))
	rr := httptest.NewRecorder()
	mountCreateRouter(h).ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("want 201 got %d body=%s", rr.Code, rr.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp["stream_id"] == nil {
		t.Errorf("missing stream_id")
	}
	if sw.inserted == nil || sw.inserted.AccessPolicy != "pin" {
		t.Errorf("expected AccessPolicy persisted as 'pin', got %+v", sw.inserted)
	}
}

func TestStreamCreate_CFProvisionFailure_ReleasesReservedCredits(t *testing.T) {
	cs, cfc, sw, sl, ff := newFakeCreateDeps()
	cfc.createErr = cf.ErrCFNetwork // any error
	h := NewStreamCreateHandler(StreamCreateDeps{
		Credit: cs, CF: cfc, Writer: sw, Shortlink: sl, Flag: ff,
		Clock: func() time.Time { return time.Now() },
	})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/streaming/streams",
		strings.NewReader(string(validCreateBody(t, uuid.New()))))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(uuid.New().String(), "photographer")))
	rr := httptest.NewRecorder()
	mountCreateRouter(h).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadGateway {
		t.Fatalf("want 502 got %d", rr.Code)
	}
	if atomic.LoadInt32(&cs.releaseCalled) < 1 {
		t.Fatalf("CF failure must release the reservation")
	}
	if sw.inserted != nil {
		t.Fatalf("stream row must NOT be inserted on CF failure")
	}
}

func TestStreamCreate_FeatureFlagOff_404(t *testing.T) {
	cs, cfc, sw, sl, ff := newFakeCreateDeps()
	ff.enabled = false
	h := NewStreamCreateHandler(StreamCreateDeps{
		Credit: cs, CF: cfc, Writer: sw, Shortlink: sl, Flag: ff,
		Clock: func() time.Time { return time.Now() },
	})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/streaming/streams",
		strings.NewReader(string(validCreateBody(t, uuid.New()))))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(uuid.New().String(), "photographer")))
	rr := httptest.NewRecorder()
	mountCreateRouter(h).ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("flag off: want 404 got %d", rr.Code)
	}
}
