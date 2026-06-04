package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestIfNoneMatch_RFC7232 exercises the conditional-request matcher across the
// RFC 7232 §3.2 cases the public reads rely on: exact match, no header, the "*"
// wildcard, weak-validator ("W/") prefixes on either side, and a
// comma-separated candidate list.
func TestIfNoneMatch_RFC7232(t *testing.T) {
	const etag = `"g-abc-123"`
	cases := []struct {
		name   string
		header string
		want   bool
	}{
		{"exact match", `"g-abc-123"`, true},
		{"no header", "", false},
		{"wildcard", "*", true},
		{"non-match", `"g-xyz-999"`, false},
		{"weak candidate matches strong etag", `W/"g-abc-123"`, true},
		{"list with match", `"g-zzz-0", "g-abc-123"`, true},
		{"list without match", `"g-zzz-0", "g-yyy-1"`, false},
		{"empty etag never matches", `"g-abc-123"`, true}, // overridden below
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if tc.header != "" {
				req.Header.Set("If-None-Match", tc.header)
			}
			got := ifNoneMatch(req, etag)
			if tc.name == "empty etag never matches" {
				// Special-case: an empty ETag must never match regardless of header.
				if ifNoneMatch(req, "") {
					t.Fatal("ifNoneMatch with empty etag must return false")
				}
				return
			}
			if got != tc.want {
				t.Fatalf("ifNoneMatch(%q, %q) = %v want %v", tc.header, etag, got, tc.want)
			}
		})
	}
}

// TestContentETag_StableAndDistinct verifies the content-hash ETag is stable for
// identical payloads and differs when the payload changes — the property the
// 304 short-circuit depends on.
func TestContentETag_StableAndDistinct(t *testing.T) {
	a := map[string]any{"name": "Studio", "count": 3}
	b := map[string]any{"name": "Studio", "count": 3}
	c := map[string]any{"name": "Studio", "count": 4}

	if contentETag(a) == "" {
		t.Fatal("contentETag must be non-empty for a marshalable value")
	}
	if contentETag(a) != contentETag(b) {
		t.Fatal("contentETag must be stable for equal payloads")
	}
	if contentETag(a) == contentETag(c) {
		t.Fatal("contentETag must differ when the payload differs")
	}
}

// TestRespondJSONWithETag_304OnMatch is the PERF-HDR guard for the studio-landing
// style public metadata read: a repeat GET echoing the content ETag must yield
// 304 with an empty body, and a fresh GET must return 200 + the full payload.
func TestRespondJSONWithETag_304OnMatch(t *testing.T) {
	payload := map[string]any{"studio": "Acme", "galleries": 2}
	const cc = "private, max-age=0, s-maxage=60, must-revalidate"

	// First request: 200 + body, and capture the ETag.
	first := httptest.NewRecorder()
	respondJSONWithETag(first, httptest.NewRequest(http.MethodGet, "/", nil), payload, cc)
	if first.Code != http.StatusOK {
		t.Fatalf("first request expected 200, got %d", first.Code)
	}
	if first.Body.Len() == 0 {
		t.Fatal("first request must return the full body")
	}
	etag := first.Header().Get("ETag")
	if etag == "" {
		t.Fatal("first request must set an ETag")
	}
	if got := first.Header().Get("Cache-Control"); got != cc {
		t.Fatalf("Cache-Control = %q want %q", got, cc)
	}
	if !strings.Contains(first.Header().Get("Cache-Control"), "s-maxage=") {
		t.Fatal("public metadata must carry an s-maxage shared-cache hint")
	}

	// Repeat request with If-None-Match: <etag> → 304 + empty body.
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("If-None-Match", etag)
	rec := httptest.NewRecorder()
	respondJSONWithETag(rec, req, payload, cc)
	if rec.Code != http.StatusNotModified {
		t.Fatalf("matching If-None-Match must return 304, got %d", rec.Code)
	}
	if rec.Body.Len() != 0 {
		t.Fatalf("304 must have an empty body, got %d bytes", rec.Body.Len())
	}
	if rec.Header().Get("ETag") != etag {
		t.Fatalf("304 must echo the ETag: got %q want %q", rec.Header().Get("ETag"), etag)
	}
}

// TestWriteNotModified_EmptyBody verifies the low-level 304 writer echoes the
// ETag and writes no body.
func TestWriteNotModified_EmptyBody(t *testing.T) {
	rec := httptest.NewRecorder()
	writeNotModified(rec, `"x-1"`)
	if rec.Code != http.StatusNotModified {
		t.Fatalf("expected 304, got %d", rec.Code)
	}
	if rec.Body.Len() != 0 {
		t.Fatal("304 body must be empty")
	}
	if rec.Header().Get("ETag") != `"x-1"` {
		t.Fatalf("304 must echo ETag, got %q", rec.Header().Get("ETag"))
	}
}
