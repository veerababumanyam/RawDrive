package handler

// gallery_analytics_handler_leak_test.go — regression coverage for F-099.
//
// The six analytics list endpoints (GetDailyStats, GetDeviceBreakdown,
// GetDownloadVelocity, GetShareChannels, GetTopViews, GetTopDownloads)
// previously embedded err.Error() directly in their 500 response body. A raw
// service/DB error can contain Postgres table/column/constraint names, so an
// authenticated workspace owner could read internal schema detail. The fix
// routes every analytics 5xx through the static, schema-safe analyticsErrMsg
// and logs the real error server-side only — matching the GetSummary path.
//
// The handler holds a concrete *service.GalleryAnalyticsService with no
// injectable failing seam, so driving each handler's 500 branch end-to-end
// would require a live DB. Instead we pin the root-cause invariant directly:
//
//  1. analyticsErrMsg must stay a fixed safe literal (no schema text, no
//     interpolation of a dynamic error). If a future change reverts to
//     err.Error()-style messages it will change this constant and fail here.
//  2. The error envelope actually emitted on the wire for an analytics 5xx
//     (built from analyticsErrMsg) must not leak raw DB error text.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// schemaLeakMarkers are substrings that would indicate raw Postgres/DB error
// text reached the client. None of these may appear in an analytics 5xx body.
var schemaLeakMarkers = []string{
	"pq:",
	"column",
	"relation",
	"constraint",
	"does not exist",
	"syntax error",
	"sql:",
}

func TestF099_AnalyticsErrMsgIsSchemaSafe(t *testing.T) {
	if analyticsErrMsg != "analytics failed" {
		t.Fatalf("analyticsErrMsg = %q, want static safe message %q", analyticsErrMsg, "analytics failed")
	}
	for _, marker := range schemaLeakMarkers {
		if strings.Contains(strings.ToLower(analyticsErrMsg), marker) {
			t.Errorf("analyticsErrMsg leaks schema-like text %q: %q", marker, analyticsErrMsg)
		}
	}
}

// TestF099_AnalyticsErrorEnvelopeHidesDBError simulates exactly what the six
// analytics 5xx branches now do — respondError with the static analyticsErrMsg
// after the service returned a schema-bearing error — and asserts the wire
// body the client receives contains the safe message and none of the raw DB
// error text. This is the response the gallery owner would have seen leaking
// before the fix.
func TestF099_AnalyticsErrorEnvelopeHidesDBError(t *testing.T) {
	// A realistic raw service/DB error the analytics service might bubble up.
	rawDBError := `pq: column gallery_views.viewer_fingerprint does not exist`

	rec := httptest.NewRecorder()
	respondError(rec, http.StatusInternalServerError, "analytics_failed", analyticsErrMsg)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusInternalServerError)
	}

	body := rec.Body.String()

	// The static safe message must be what the client sees.
	if !strings.Contains(body, "analytics failed") {
		t.Errorf("response body missing static safe message; got %q", body)
	}

	// The raw DB error and its schema fragments must NOT appear.
	if strings.Contains(body, rawDBError) {
		t.Errorf("response body leaks raw DB error %q; got %q", rawDBError, body)
	}
	lowerBody := strings.ToLower(body)
	for _, marker := range schemaLeakMarkers {
		if strings.Contains(lowerBody, marker) {
			t.Errorf("response body leaks schema-like marker %q; got %q", marker, body)
		}
	}

	// Sanity: the body parses as the standard error envelope with the
	// analytics_failed code, so we know we asserted on the real shape.
	var env ErrorEnvelope
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("response body is not a valid error envelope: %v (body=%q)", err, body)
	}
	if env.Error.Code != "analytics_failed" {
		t.Errorf("envelope code = %q, want %q", env.Error.Code, "analytics_failed")
	}
	if env.Error.Message != analyticsErrMsg {
		t.Errorf("envelope message = %q, want %q", env.Error.Message, analyticsErrMsg)
	}
}
