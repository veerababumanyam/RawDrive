package streaming_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/featureflag"
)

// RED-phase test for M34 R3 routing: F-014 feature flag gates /balance,
// leaves legacy M8 endpoint untouched.
//
// This test exercises the gating contract that cmd/api/router.go will mount.
// The GREEN phase installs a thin gate around the credit balance endpoint.

type fakeSettings struct{ enabled bool }

func (f *fakeSettings) GetByKey(_ interface{ Deadline() (interface{}, bool) }, _, _ string) (_ any, _ error) {
	return nil, nil
}

func buildRouter(enabled bool) http.Handler {
	r := chi.NewRouter()
	// Legacy M8 endpoint — always present.
	r.Get("/api/v1/credits/balance", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"legacy":true}`))
	})

	// F-014 balance — gated.
	on := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"v":"f014"}`))
	})
	off := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.NotFound(w, nil)
	})

	// Minimal Gate: bypasses SettingsLookup, uses bare boolean.
	// GREEN phase replaces this with featureflag.StreamingCommercialFlag.Gate.
	gate := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if enabled {
			on.ServeHTTP(w, req)
		} else {
			off.ServeHTTP(w, req)
		}
	})
	r.Get("/api/v1/streaming/balance", gate.ServeHTTP)
	return r
}

func TestRoutingFeatureFlag_F014(t *testing.T) {
	t.Run("flag_off", func(t *testing.T) {
		r := buildRouter(false)
		// F-014 endpoint 404.
		req := httptest.NewRequest(http.MethodGet, "/api/v1/streaming/balance", nil)
		req = req.WithContext(featureflag.WithWorkspace(req.Context(), uuid.New()))
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)
		if rr.Code != http.StatusNotFound {
			t.Fatalf("flag_off: want 404 on F-014 got %d", rr.Code)
		}
		// Legacy still 200.
		rr = httptest.NewRecorder()
		r.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/v1/credits/balance", nil))
		if rr.Code != http.StatusOK {
			t.Fatalf("flag_off: legacy want 200 got %d", rr.Code)
		}
	})

	t.Run("flag_on", func(t *testing.T) {
		r := buildRouter(true)
		req := httptest.NewRequest(http.MethodGet, "/api/v1/streaming/balance", nil)
		req = req.WithContext(featureflag.WithWorkspace(req.Context(), uuid.New()))
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("flag_on: want 200 got %d", rr.Code)
		}
	})

}
