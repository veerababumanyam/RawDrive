package handler

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/rawdrive/backend/internal/auth"
)

// M39 E6-S1 GREEN: password-reset HTTP contract assertions. Integration
// (Mailpit email + real DB) is covered by existing auth suites and the
// round-4 Playwright flow; these cover the handler's validation surface.

type fakePasswordSvc struct {
	requestErr error
	resetErr   error
	requests   []string
	resets     []struct{ email, otp, pw string }
}

func (f *fakePasswordSvc) RequestReset(ctx context.Context, email string) error {
	f.requests = append(f.requests, email)
	return f.requestErr
}

func (f *fakePasswordSvc) ResetPassword(ctx context.Context, email, otp, newPassword string) error {
	f.resets = append(f.resets, struct{ email, otp, pw string }{email, otp, newPassword})
	return f.resetErr
}

// auth.PasswordService also has a ValidatePassword method — provide a stub
// so the fake satisfies the interface; the handler doesn't call it.
func (f *fakePasswordSvc) ValidatePassword(pw string) error { return nil }

var _ auth.PasswordService = (*fakePasswordSvc)(nil)

type fakeRevoker struct {
	calls []string
	err   error
}

func (f *fakeRevoker) RevokeAllByEmail(ctx context.Context, email string) error {
	f.calls = append(f.calls, email)
	return f.err
}

func TestRequestPasswordReset_ValidEmail_Returns202(t *testing.T) {
	svc := &fakePasswordSvc{}
	h := NewAuthPasswordResetHandler(svc, nil)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/request-password-reset",
		bytes.NewReader([]byte(`{"email":"user@example.com"}`)))
	rec := httptest.NewRecorder()
	h.RequestReset(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d (body=%q)", rec.Code, rec.Body.String())
	}
	if len(svc.requests) != 1 {
		t.Fatalf("expected 1 service call, got %d", len(svc.requests))
	}
	if svc.requests[0] != "user@example.com" {
		t.Fatalf("expected email lowercased/trimmed, got %q", svc.requests[0])
	}
}

func TestRequestPasswordReset_UnregisteredEmailStillReturns202(t *testing.T) {
	// Simulate the service succeeding silently for unregistered emails (the
	// real service does this to prevent enumeration); handler returns 202.
	svc := &fakePasswordSvc{requestErr: nil}
	h := NewAuthPasswordResetHandler(svc, nil)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/request-password-reset",
		bytes.NewReader([]byte(`{"email":"nobody@example.com"}`)))
	rec := httptest.NewRecorder()
	h.RequestReset(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected 202 for unregistered email (enumeration defense), got %d", rec.Code)
	}
}

func TestRequestPasswordReset_MalformedEmail_Returns400(t *testing.T) {
	svc := &fakePasswordSvc{}
	h := NewAuthPasswordResetHandler(svc, nil)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/request-password-reset",
		bytes.NewReader([]byte(`{"email":"not-an-email"}`)))
	rec := httptest.NewRecorder()
	h.RequestReset(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for malformed email, got %d", rec.Code)
	}
	if len(svc.requests) != 0 {
		t.Fatalf("service must not be called for invalid email; got %d calls", len(svc.requests))
	}
}

func TestRequestPasswordReset_RateLimit_Returns429(t *testing.T) {
	svc := &fakePasswordSvc{requestErr: errors.New("rate limit exceeded")}
	h := NewAuthPasswordResetHandler(svc, nil)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/request-password-reset",
		bytes.NewReader([]byte(`{"email":"user@example.com"}`)))
	rec := httptest.NewRecorder()
	h.RequestReset(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 on rate limit, got %d", rec.Code)
	}
}

func TestResetPassword_Success_Returns204AndRevokesSessions(t *testing.T) {
	svc := &fakePasswordSvc{}
	revoker := &fakeRevoker{}
	h := NewAuthPasswordResetHandler(svc, revoker)
	body := []byte(`{"email":"user@example.com","otp":"123456","new_password":"Str0ng!NewPass"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/reset-password", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ResetPassword(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d (body=%q)", rec.Code, rec.Body.String())
	}
	if len(revoker.calls) != 1 || revoker.calls[0] != "user@example.com" {
		t.Fatalf("expected session revocation for user@example.com, got %v", revoker.calls)
	}
}

func TestResetPassword_WrongOTP_Returns400(t *testing.T) {
	svc := &fakePasswordSvc{resetErr: errors.New("invalid or expired otp")}
	h := NewAuthPasswordResetHandler(svc, nil)
	body := []byte(`{"email":"user@example.com","otp":"000000","new_password":"Str0ng!NewPass"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/reset-password", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ResetPassword(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on wrong OTP, got %d", rec.Code)
	}
}

func TestResetPassword_RateLimit_Returns429(t *testing.T) {
	svc := &fakePasswordSvc{resetErr: errors.New("too many attempts")}
	h := NewAuthPasswordResetHandler(svc, nil)
	body := []byte(`{"email":"user@example.com","otp":"123456","new_password":"Str0ng!NewPass"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/reset-password", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ResetPassword(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 on rate limit, got %d", rec.Code)
	}
}

func TestResetPassword_WeakPassword_Returns400(t *testing.T) {
	svc := &fakePasswordSvc{}
	h := NewAuthPasswordResetHandler(svc, nil)
	body := []byte(`{"email":"user@example.com","otp":"123456","new_password":"abc"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/reset-password", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ResetPassword(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on weak password, got %d", rec.Code)
	}
	if len(svc.resets) != 0 {
		t.Fatalf("service must not be called for weak password; got %d calls", len(svc.resets))
	}
}

// TestResetPassword_ComplexityRejection_NoVerbatimLeak is the F-101 regression.
// Before the fix the handler echoed validateResetPasswordComplexity's sentinel
// verbatim via `+err.Error()+`, normalizing a leak-prone pattern. The handler
// must now return a fixed, known-safe message and never reflect the error value.
func TestResetPassword_ComplexityRejection_NoVerbatimLeak(t *testing.T) {
	svc := &fakePasswordSvc{}
	h := NewAuthPasswordResetHandler(svc, nil)
	// Valid email + valid-length OTP so the request reaches the complexity gate,
	// but a weak password ("short") that trips validateResetPasswordComplexity.
	body := []byte(`{"email":"user@example.com","otp":"123456","new_password":"short"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/reset-password", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ResetPassword(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on weak password, got %d", rec.Code)
	}
	got := strings.TrimSpace(rec.Body.String())
	const want = `{"error":"password does not meet complexity requirements"}`
	if got != want {
		t.Fatalf("expected fixed safe body %q, got %q", want, got)
	}
	// The verbatim internal sentinel text must never appear in the response.
	for _, leak := range []string{"min 12 chars", "upper, lower, digit"} {
		if strings.Contains(got, leak) {
			t.Fatalf("response leaked internal complexity detail %q: %q", leak, got)
		}
	}
	// The complexity gate returns before the service is ever touched.
	if len(svc.resets) != 0 {
		t.Fatalf("service must not be called for weak password; got %d calls", len(svc.resets))
	}
}

func TestResetPassword_MissingOTP_Returns400(t *testing.T) {
	svc := &fakePasswordSvc{}
	h := NewAuthPasswordResetHandler(svc, nil)
	body := []byte(`{"email":"user@example.com","otp":"","new_password":"Str0ng!Pass"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/reset-password", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ResetPassword(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on missing OTP, got %d", rec.Code)
	}
}

// Sanity test — the fake PasswordService handles the interface.
// This is not a behavior test but it ensures auth.PasswordService hasn't
// drifted since we wrote fakePasswordSvc.
func TestAuthPasswordResetHandler_TypeSanity(t *testing.T) {
	h := NewAuthPasswordResetHandler(&fakePasswordSvc{}, &fakeRevoker{})
	if h == nil {
		t.Fatal("constructor must return non-nil handler")
	}
}

// --- integration smoke: invalid JSON returns 400 ---
func TestAuthPasswordResetHandler_InvalidJSONReturns400(t *testing.T) {
	h := NewAuthPasswordResetHandler(&fakePasswordSvc{}, nil)
	for _, path := range []string{"/api/v1/auth/request-password-reset", "/api/v1/auth/reset-password"} {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader("not-json"))
		rec := httptest.NewRecorder()
		switch path {
		case "/api/v1/auth/request-password-reset":
			h.RequestReset(rec, req)
		default:
			h.ResetPassword(rec, req)
		}
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s invalid body: expected 400, got %d", path, rec.Code)
		}
	}
	_ = time.Now // keep "time" imported if future tests use it
}
