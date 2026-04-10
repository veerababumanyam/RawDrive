package handler

// error_envelope_test.go — pure-logic tests for the M14 error envelope
// helper. These run without a live server by using httptest.ResponseRecorder.

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRespondError_ShapeContainsAllFields(t *testing.T) {
	rr := httptest.NewRecorder()
	respondError(rr, 418, "teapot", "I'm a teapot")

	if rr.Code != 418 {
		t.Errorf("status: want 418, got %d", rr.Code)
	}
	if ct := rr.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("content-type: want application/json, got %q", ct)
	}

	var env ErrorEnvelope
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if env.Error.Code != "teapot" {
		t.Errorf("code: want teapot, got %q", env.Error.Code)
	}
	if env.Error.Message != "I'm a teapot" {
		t.Errorf("message mismatch: %q", env.Error.Message)
	}
	if env.Error.RequestID == "" {
		t.Errorf("request_id should always be populated")
	}
	if env.Error.Timestamp == "" {
		t.Errorf("timestamp should always be populated")
	}
	// Timestamp should be RFC3339-ish (contains T and Z or offset).
	if !strings.Contains(env.Error.Timestamp, "T") {
		t.Errorf("timestamp not ISO-8601: %q", env.Error.Timestamp)
	}
}

func TestRespondError_PreservesUpstreamRequestID(t *testing.T) {
	rr := httptest.NewRecorder()
	rr.Header().Set("X-Request-ID", "upstream-abc-123")
	respondError(rr, 500, "oops", "something broke")

	var env ErrorEnvelope
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if env.Error.RequestID != "upstream-abc-123" {
		t.Errorf("request_id: want upstream-abc-123, got %q", env.Error.RequestID)
	}
}

func TestRespondError_MintsRequestIDWhenAbsent(t *testing.T) {
	rr := httptest.NewRecorder()
	respondError(rr, 400, "bad", "bad input")

	// The helper should mint an ID and echo it back on the header so the
	// client can log it for support requests.
	if rr.Header().Get("X-Request-ID") == "" {
		t.Errorf("X-Request-ID header should be set on the response")
	}
}
