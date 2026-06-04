package handler

// web_vitals_handler.go — PERF-RUM: Core Web Vitals RUM ingest endpoint.
//
// POST /api/v1/rum accepts a single Core Web Vitals sample beaconed by the
// browser (frontend/src/components/observability/WebVitalsReporter.tsx) and
// records it into the Prometheus histogram exported on GET /metrics. The
// endpoint is intentionally PUBLIC and unauthenticated: it must capture field
// telemetry from anonymous visitors on public gallery share pages as well as
// signed-in dashboard users. It carries NO PII — only a metric name, the
// Next.js route TEMPLATE, and the numeric value — and is rate-limited at the
// mount site to blunt beacon flooding.
//
// Validation is strict and fail-closed so a hostile client cannot:
//   - explode Prometheus label cardinality (metric name is checked against the
//     closed canonical set; the route must match a conservative template shape
//     and must not contain a query string),
//   - smuggle a tokenised URL into a label (query strings are rejected),
//   - poison histograms with non-finite or absurd values.

import (
	"encoding/json"
	"math"
	"net/http"
	"strings"

	"github.com/rawdrive/backend/internal/observability"
)

// maxRUMBodyBytes caps the ingest body. A single web-vitals sample is a few
// hundred bytes; anything larger is rejected before decoding.
const maxRUMBodyBytes = 2 * 1024

// maxRouteLen bounds the route-template label length to keep cardinality and
// memory bounded even for deeply nested routes.
const maxRouteLen = 256

// maxWebVitalValue is an upper sanity bound (in ms) on a reported sample. The
// largest meaningful timing metric is well under this; values above it (or NaN
// / Inf / negative) are dropped as garbage.
const maxWebVitalValue = 600000 // 10 minutes in ms

// webVitalSink is the narrow surface the handler needs to record a sample.
// *observability.WebVitalsMetrics satisfies it; tests inject a fake.
type webVitalSink interface {
	Observe(metric, route string, value float64)
}

// WebVitalsHandler ingests Core Web Vitals RUM samples.
type WebVitalsHandler struct {
	sink webVitalSink
}

// NewWebVitalsHandler constructs the handler around a metrics sink.
func NewWebVitalsHandler(sink webVitalSink) *WebVitalsHandler {
	return &WebVitalsHandler{sink: sink}
}

// webVitalPayload is the fire-and-forget beacon body. Field names match the
// web-vitals Metric shape the frontend reporter sends. Only these three fields
// are read; anything else in the JSON is ignored.
type webVitalPayload struct {
	Metric string  `json:"metric"`
	Route  string  `json:"route"`
	Value  float64 `json:"value"`
}

// Ingest handles POST /api/v1/rum. It always returns 204 on a well-formed,
// valid sample and 400 on a malformed/invalid one. It never blocks on anything
// slow and reads no auth context — the beacon is fire-and-forget by design.
func (h *WebVitalsHandler) Ingest(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRUMBodyBytes)
	defer r.Body.Close()

	// The browser's full web-vitals Metric object carries extra fields
	// (id, rating, delta, navigationType, entries, …) that we deliberately
	// ignore. We decode leniently into the three fields we record; unknown
	// fields are skipped rather than rejected so a faithful Metric POST
	// succeeds, while genuinely malformed JSON still fails the decode.
	var p webVitalPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	metric := strings.TrimSpace(p.Metric)
	if !observability.IsCanonicalWebVitalName(metric) {
		http.Error(w, "invalid metric", http.StatusBadRequest)
		return
	}

	route, ok := sanitizeRouteTemplate(p.Route)
	if !ok {
		http.Error(w, "invalid route", http.StatusBadRequest)
		return
	}

	if !validWebVitalValue(p.Value) {
		http.Error(w, "invalid value", http.StatusBadRequest)
		return
	}

	h.sink.Observe(metric, route, p.Value)
	w.WriteHeader(http.StatusNoContent)
}

// sanitizeRouteTemplate validates that route is a plausible Next.js route
// TEMPLATE (a path, optionally with [param]/[...catchall] segments) and not a
// concrete URL with a query string or token. It returns the cleaned route and
// whether it is acceptable. A query string, fragment, scheme, or oversized
// value is rejected outright so no PII / token can become a metric label.
func sanitizeRouteTemplate(route string) (string, bool) {
	route = strings.TrimSpace(route)
	if route == "" {
		// Empty / unknown route: bucket under "/" rather than dropping the
		// sample, so totals stay accurate. Anonymous landing hits report "/".
		return "/", true
	}
	if len(route) > maxRouteLen {
		return "", false
	}
	if !strings.HasPrefix(route, "/") {
		return "", false
	}
	// Reject anything that looks like a concrete URL carrying data: query
	// strings (?token=…), fragments (#…), schemes (://), or raw whitespace.
	if strings.ContainsAny(route, "?#") || strings.Contains(route, "://") {
		return "", false
	}
	for _, r := range route {
		// Allow path chars + the [bracket] template syntax + dots/dashes.
		// Anything outside this conservative set (control chars, spaces, %)
		// is rejected so labels stay clean and bounded.
		switch {
		case r >= 'a' && r <= 'z',
			r >= 'A' && r <= 'Z',
			r >= '0' && r <= '9':
		default:
			switch r {
			case '/', '[', ']', '-', '_', '.':
			default:
				return "", false
			}
		}
	}
	return route, true
}

// validWebVitalValue rejects non-finite, negative, or absurdly large samples.
func validWebVitalValue(v float64) bool {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return false
	}
	return v >= 0 && v <= maxWebVitalValue
}
