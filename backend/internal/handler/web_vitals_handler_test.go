package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// fakeWebVitalSink records Observe calls so tests can assert what was ingested.
type fakeWebVitalSink struct {
	calls []struct {
		metric string
		route  string
		value  float64
	}
}

func (f *fakeWebVitalSink) Observe(metric, route string, value float64) {
	f.calls = append(f.calls, struct {
		metric string
		route  string
		value  float64
	}{metric, route, value})
}

func postRUM(t *testing.T, h *WebVitalsHandler, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/rum", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.Ingest(rec, req)
	return rec
}

func TestWebVitalsHandler_ValidSampleRecorded(t *testing.T) {
	sink := &fakeWebVitalSink{}
	h := NewWebVitalsHandler(sink)

	// A faithful web-vitals Metric object carries extra fields the handler
	// must ignore (id, rating, delta, navigationType).
	body := `{"metric":"LCP","route":"/galleries/[id]","value":1823.4,"id":"v3-abc","rating":"good","delta":1823.4,"navigationType":"navigate"}`
	rec := postRUM(t, h, body)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d (%s)", rec.Code, rec.Body.String())
	}
	if len(sink.calls) != 1 {
		t.Fatalf("expected 1 Observe call, got %d", len(sink.calls))
	}
	c := sink.calls[0]
	if c.metric != "LCP" || c.route != "/galleries/[id]" || c.value != 1823.4 {
		t.Fatalf("recorded wrong sample: %+v", c)
	}
}

func TestWebVitalsHandler_RejectsNonCanonicalMetric(t *testing.T) {
	sink := &fakeWebVitalSink{}
	h := NewWebVitalsHandler(sink)

	rec := postRUM(t, h, `{"metric":"EVIL","route":"/","value":1}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for bad metric, got %d", rec.Code)
	}
	if len(sink.calls) != 0 {
		t.Fatalf("non-canonical metric must not be recorded")
	}
}

func TestWebVitalsHandler_RejectsRouteWithQueryString(t *testing.T) {
	sink := &fakeWebVitalSink{}
	h := NewWebVitalsHandler(sink)

	// A query string could leak a token into a Prometheus label — must reject.
	rec := postRUM(t, h, `{"metric":"INP","route":"/g/abc?token=secret","value":120}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for route with query string, got %d", rec.Code)
	}
	if len(sink.calls) != 0 {
		t.Fatalf("route with query string must not be recorded")
	}
}

func TestWebVitalsHandler_RejectsBadValues(t *testing.T) {
	sink := &fakeWebVitalSink{}
	h := NewWebVitalsHandler(sink)

	for _, body := range []string{
		`{"metric":"LCP","route":"/","value":-5}`,
		`{"metric":"LCP","route":"/","value":1e12}`,
	} {
		rec := postRUM(t, h, body)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for body %q, got %d", body, rec.Code)
		}
	}
	if len(sink.calls) != 0 {
		t.Fatalf("invalid values must not be recorded")
	}
}

func TestWebVitalsHandler_EmptyRouteBucketsAsRoot(t *testing.T) {
	sink := &fakeWebVitalSink{}
	h := NewWebVitalsHandler(sink)

	rec := postRUM(t, h, `{"metric":"CLS","route":"","value":0.04}`)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
	if len(sink.calls) != 1 || sink.calls[0].route != "/" {
		t.Fatalf("empty route should bucket as '/', got %+v", sink.calls)
	}
}

func TestWebVitalsHandler_RejectsMalformedJSON(t *testing.T) {
	sink := &fakeWebVitalSink{}
	h := NewWebVitalsHandler(sink)

	rec := postRUM(t, h, `{not json`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for malformed JSON, got %d", rec.Code)
	}
}
