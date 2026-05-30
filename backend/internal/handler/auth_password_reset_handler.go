package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"regexp"
	"strings"

	"github.com/rawdrive/backend/internal/auth"
	"github.com/rawdrive/backend/internal/logging"
	"github.com/rawdrive/backend/internal/passwordpolicy"
)

// M39 E6-S1 (FR-F02): password-reset HTTP endpoints.
//
// The handler wraps auth.PasswordService (which already enforces
// constant-time OTP compare, rate limiting inside RequestReset, and
// notification emission) and adds:
//   - input validation (email format, new-password complexity)
//   - always-202 response on /request-password-reset to defeat
//     enumeration (the underlying service already does the right thing
//     for unregistered emails — we just translate service errors that
//     aren't leak-vector into 202 too)
//   - refresh-session revocation on successful reset via a pluggable
//     RefreshSessionRevoker (SEC-F03)

// RefreshSessionRevoker is the abstraction for post-reset session
// invalidation. Implementations wrap a DELETE over refresh_sessions
// rows whose sub matches the user. Nil is allowed for unit tests (we
// still want to exercise the handler's contract without a real DB).
type RefreshSessionRevoker interface {
	RevokeAllByEmail(ctx context.Context, email string) error
}

type AuthPasswordResetHandler struct {
	svc     auth.PasswordService
	revoker RefreshSessionRevoker
}

func NewAuthPasswordResetHandler(svc auth.PasswordService, revoker RefreshSessionRevoker) *AuthPasswordResetHandler {
	return &AuthPasswordResetHandler{svc: svc, revoker: revoker}
}

var resetEmailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

type requestResetBody struct {
	Email string `json:"email"`
}

type resetPasswordBody struct {
	Email       string `json:"email"`
	OTP         string `json:"otp"`
	NewPassword string `json:"new_password"`
}

// RequestReset handles POST /api/v1/auth/request-password-reset (AC-F02-1, AC-F02-2).
// Always returns 202 for any syntactically valid email — service.RequestReset
// silently swallows unregistered-email signals, so no enumeration leak.
// Malformed email returns 400 so clients catch typos early.
func (h *AuthPasswordResetHandler) RequestReset(w http.ResponseWriter, r *http.Request) {
	var body requestResetBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if !resetEmailRegex.MatchString(email) {
		http.Error(w, `{"error":"invalid email format"}`, http.StatusBadRequest)
		return
	}
	if err := h.svc.RequestReset(r.Context(), email); err != nil {
		// PasswordService.RequestReset returns an error on rate-limit hit;
		// surface that as 429 but fall back to 202 on any other error class
		// to avoid leaking enumeration signal.
		if isRateLimitErr(err) {
			http.Error(w, `{"error":"too many requests"}`, http.StatusTooManyRequests)
			return
		}
	}
	w.WriteHeader(http.StatusAccepted)
}

// ResetPassword handles POST /api/v1/auth/reset-password (AC-F02-3/4/5).
// Returns 204 on success, 400 on wrong/replayed OTP or weak password,
// 429 on rate-limit. On success it revokes all refresh sessions for the
// email (SEC-F03) so any attacker-held tokens are immediately invalid.
func (h *AuthPasswordResetHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var body resetPasswordBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	otp := strings.TrimSpace(body.OTP)
	if !resetEmailRegex.MatchString(email) {
		http.Error(w, `{"error":"invalid email format"}`, http.StatusBadRequest)
		return
	}
	if len(otp) < 4 {
		http.Error(w, `{"error":"otp required"}`, http.StatusBadRequest)
		return
	}
	if err := validateResetPasswordComplexity(body.NewPassword); err != nil {
		// F-101: do NOT echo err.Error() into the response body. Even though
		// the complexity sentinel text is in-process and controlled, echoing
		// +err.Error()+ normalizes a leak-prone pattern. Return a fixed,
		// known-safe string instead so this handler never establishes the
		// precedent of reflecting an error value into client output.
		http.Error(w, `{"error":"password does not meet complexity requirements"}`, http.StatusBadRequest)
		return
	}
	if err := h.svc.ResetPassword(r.Context(), email, otp, body.NewPassword); err != nil {
		if isRateLimitErr(err) {
			http.Error(w, `{"error":"too many attempts"}`, http.StatusTooManyRequests)
			return
		}
		// All other errors (wrong OTP, replayed OTP, expired OTP, weak
		// password rejected by service) map to 400. Never surface internal
		// detail so OTP probes can't distinguish cases.
		http.Error(w, `{"error":"reset failed"}`, http.StatusBadRequest)
		return
	}
	// SEC-F03: invalidate every active refresh session for this user.
	if h.revoker != nil {
		if err := h.revoker.RevokeAllByEmail(r.Context(), email); err != nil {
			log.Printf("password reset: failed to revoke sessions for %s: %v", logging.MaskEmail(email), err)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// validateResetPasswordComplexity mirrors admin_user_service.validatePasswordComplexity
// but lives in the handler package to avoid a service-package import cycle.
func validateResetPasswordComplexity(pw string) error {
	if len(pw) < 12 {
		return errors.New("password does not meet complexity (min 12 chars)")
	}
	// F-056: cap length at bcrypt's byte limit so overlong reset passwords are
	// rejected before hashing.
	if !passwordpolicy.FitsBcrypt(pw) {
		return errors.New("password too long (max 72 chars)")
	}
	var hasUpper, hasLower, hasDigit, hasSpecial bool
	for _, c := range pw {
		switch {
		case c >= 'A' && c <= 'Z':
			hasUpper = true
		case c >= 'a' && c <= 'z':
			hasLower = true
		case c >= '0' && c <= '9':
			hasDigit = true
		default:
			hasSpecial = true
		}
	}
	if !(hasUpper && hasLower && hasDigit && hasSpecial) {
		return errors.New("password must include upper, lower, digit, and special character")
	}
	return nil
}

func isRateLimitErr(err error) bool {
	if err == nil {
		return false
	}
	m := err.Error()
	return strings.Contains(m, "rate limit") || strings.Contains(m, "too many") || strings.Contains(m, "throttled")
}
