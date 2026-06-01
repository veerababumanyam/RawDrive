package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/crypto"
)

// F-007 (M17 wave 2): MFA HTTP handler.
//
// Exposes four endpoints:
//
//	POST /auth/mfa/enroll             (authenticated) — generate secret + persist
//	POST /auth/mfa/verify-enrollment  (authenticated) — verify first code, activate
//	POST /auth/verify-totp            (mfa_token)     — login step-up after password
//	POST /auth/mfa/status             (authenticated) — check current enrollment state
//
// The handler reaches into its dependencies via small interfaces so unit
// tests can inject in-memory fakes without spinning up a real DB pool.
// See mfa_handler_test.go for the test doubles.

// MFAEnrollmentStore abstracts the DB persistence of TOTP enrollments.
// Mirrors the repository.UserMFAEnrollmentsRepo surface so the auth
// handler does not depend on the repository package directly (keeps the
// package graph acyclic).
type MFAEnrollmentStore interface {
	Create(ctx context.Context, e *MFAEnrollmentRow) error
	GetByUserID(ctx context.Context, userID uuid.UUID) (*MFAEnrollmentRow, error)
	UpdateLastVerified(ctx context.Context, userID uuid.UUID) error
	Delete(ctx context.Context, userID uuid.UUID) error
}

// MFAEnrollmentRow is the data transfer shape used by MFAEnrollmentStore.
// The repository adapter converts between this and its own struct.
type MFAEnrollmentRow struct {
	ID                   uuid.UUID
	UserID               uuid.UUID
	TOTPSecretCT         []byte
	TOTPSecretDEKWrapped []byte
	TOTPIssuer           string
	EnrolledAt           time.Time
	LastVerifiedAt       *time.Time
	DisabledAt           *time.Time
}

// MFARecoveryCodeStore abstracts recovery code persistence.
type MFARecoveryCodeStore interface {
	BulkInsert(ctx context.Context, userID uuid.UUID, hashes []string) error
	DeleteAll(ctx context.Context, userID uuid.UUID) error
	CountActive(ctx context.Context, userID uuid.UUID) (int, error)
	// F-007 (M17 audit followup): ListActive + MarkConsumed are the
	// primitives VerifyRecoveryCode needs at login step-up time. The
	// handler iterates ListActive, bcrypt-compares each hash against
	// the submitted plaintext, then calls MarkConsumed on a match. The
	// MarkConsumed call is atomic (UPDATE ... WHERE consumed_at IS
	// NULL RETURNING) on the repo side so two concurrent consumes of
	// the same code cannot both succeed.
	ListActive(ctx context.Context, userID uuid.UUID) ([]MFARecoveryCodeHashRow, error)
	MarkConsumed(ctx context.Context, id uuid.UUID) error
}

// MFARecoveryCodeHashRow is the minimal row shape VerifyRecoveryCode
// needs from MFARecoveryCodeStore.ListActive — enough to bcrypt-compare
// and uniquely identify a row for MarkConsumed.
type MFARecoveryCodeHashRow struct {
	ID       uuid.UUID
	CodeHash string
}

// ErrMFANotEnrolled is returned by MFAEnrollmentStore.GetByUserID when
// the user has not enrolled. Auth handlers use errors.Is to distinguish
// "not enrolled" from transient failures.
var ErrMFANotEnrolled = errors.New("mfa: not enrolled")

// MFAChallengePurpose is the JWT claim value for challenge tokens issued
// by Login when a mandatory-MFA role needs to step up via TOTP. The
// VerifyTOTP endpoint checks for this exact value before accepting the
// token — it prevents a regular access token from being used as a
// challenge and vice versa.
const MFAChallengePurpose = "mfa_challenge"

// mfaChallengeExpiry is how long a challenge token is valid. Must be
// long enough for a user to open their authenticator but short enough
// that a leaked token is not a useful attack primitive.
const mfaChallengeExpiry = 5 * time.Minute

// MFAHandler owns the MFA HTTP endpoints and their dependencies.
type MFAHandler struct {
	totp       TOTPService
	recovery   RecoveryCodeService
	enrollRepo MFAEnrollmentStore
	codesRepo  MFARecoveryCodeStore
	envelope   *crypto.Envelope // nil = MFA disabled (dev fallback)
	jwt        JWTService
	issuer     string
	// userLookup resolves a user ID to the account name used as the
	// TOTP label. Typically the user's email. Tests inject a stub.
	userLookup func(ctx context.Context, userID uuid.UUID) (accountName string, err error)
	// workspaceLookup mirrors the existing Handler.workspaces field so
	// VerifyTOTP can resolve workspace claims after a successful step-up.
	workspaceLookup WorkspaceLookup
	// now is injected for deterministic tests.
	now func() time.Time

	// consumedChallenges tracks MFA challenge tokens that have been used
	// successfully, to enforce single-use semantics (S-003). The key is a
	// hex-encoded sha256 of the raw mfa_token string; the value is the
	// wall-clock time at which the entry becomes eligible for eviction
	// (challenge expiry + 1 minute buffer). A failed TOTP attempt does
	// NOT burn the token — we only consume on successful verification,
	// just before issuing the full access/refresh tokens. That keeps
	// retry UX alive while closing the replay-after-success window.
	//
	// In-process sync.Map is acceptable here because the challenge
	// lifetime (5 minutes) is shorter than any realistic restart window,
	// and brute-forcing a valid 6-digit code within one 5-minute JWT
	// lifetime is already bounded by the global 60/min rate limiter. A
	// horizontal scale-out would want a Valkey-backed denylist instead;
	// that is tracked as a separate Tier A finding.
	consumedChallenges sync.Map
}

// NewMFAHandler constructs the MFA handler. The envelope may be nil in
// non-production environments; when nil, Enroll and VerifyEnrollment
// return 503 so callers see a clear "MFA unavailable" signal instead of
// silently storing plaintext secrets.
func NewMFAHandler(
	totp TOTPService,
	recovery RecoveryCodeService,
	enrollRepo MFAEnrollmentStore,
	codesRepo MFARecoveryCodeStore,
	envelope *crypto.Envelope,
	jwtSvc JWTService,
	issuer string,
	userLookup func(ctx context.Context, userID uuid.UUID) (string, error),
	workspaceLookup WorkspaceLookup,
) *MFAHandler {
	if issuer == "" {
		issuer = defaultTOTPIssuer
	}
	return &MFAHandler{
		totp:            totp,
		recovery:        recovery,
		enrollRepo:      enrollRepo,
		codesRepo:       codesRepo,
		envelope:        envelope,
		jwt:             jwtSvc,
		issuer:          issuer,
		userLookup:      userLookup,
		workspaceLookup: workspaceLookup,
		now:             time.Now,
	}
}

// PublicRoutes returns the chi subrouter for MFA endpoints that do NOT
// require a valid access token. /verify-totp and /verify-recovery-code
// are exempt because the mfa_token IS their authentication.
func (h *MFAHandler) PublicRoutes() chi.Router {
	r := chi.NewRouter()
	r.Post("/verify-totp", h.VerifyTOTP)
	r.Post("/verify-recovery-code", h.VerifyRecoveryCode)
	return r
}

// AuthenticatedRoutes returns the MFA endpoints that require a valid
// access token. main.go mounts these behind the JWT middleware.
func (h *MFAHandler) AuthenticatedRoutes() chi.Router {
	r := chi.NewRouter()
	r.Post("/enroll", h.Enroll)
	r.Post("/verify-enrollment", h.VerifyEnrollment)
	r.Get("/status", h.Status)
	r.Delete("/enrollment", h.DeleteEnrollment)
	return r
}

// ─────────────────────────────── Request / Response ───────────────────────────────

type mfaEnrollResponse struct {
	Secret     string `json:"secret"`      // plaintext base32 for manual entry
	OtpauthURL string `json:"otpauth_url"` // for QR code rendering
	Issuer     string `json:"issuer"`
}

type mfaVerifyEnrollmentRequest struct {
	Code string `json:"code"`
}

type mfaVerifyEnrollmentResponse struct {
	RecoveryCodes []string `json:"recovery_codes"` // shown once
}

type mfaVerifyTOTPRequest struct {
	MFAToken string `json:"mfa_token"`
	Code     string `json:"code"`
}

type mfaVerifyTOTPResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
}

type mfaVerifyRecoveryCodeRequest struct {
	MFAToken     string `json:"mfa_token"`
	RecoveryCode string `json:"recovery_code"`
}

type mfaStatusResponse struct {
	Enrolled          bool `json:"enrolled"`
	VerifiedEnrolled  bool `json:"verified_enrolled"`
	ActiveRecoveryCnt int  `json:"active_recovery_codes"`
}

// ─────────────────────────────── Handlers ───────────────────────────────

// Enroll generates a fresh TOTP secret for the authenticated user,
// envelope-encrypts it, and persists a pending enrollment row. The
// plaintext secret + otpauth URL are returned so the client can render
// a QR code. The enrollment is NOT yet active — VerifyEnrollment must
// be called with a valid first code to activate it.
func (h *MFAHandler) Enroll(w http.ResponseWriter, r *http.Request) {
	if h.envelope == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error":  "mfa_unavailable",
			"reason": "TOTP secret encryption is not configured. Set PLATFORM_SETTINGS_KEK.",
		})
		return
	}

	userID, ok := h.authedUserID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthenticated"})
		return
	}

	// Handle existing enrollment rows intelligently:
	//   - Verified (LastVerifiedAt != nil): reject with 409 — the client
	//     must hit DELETE /auth/mfa/enrollment first, which is a gated
	//     operation. This prevents an attacker with a stolen session
	//     from silently replacing a victim's active TOTP secret.
	//   - Unverified (LastVerifiedAt == nil): the user abandoned a
	//     previous enrollment flow (SF-003). Silently clean up the
	//     stale row + any orphaned recovery codes and proceed with a
	//     fresh enrollment. Otherwise users get permanently stuck at
	//     "already_enrolled" with no way out.
	if existing, err := h.enrollRepo.GetByUserID(r.Context(), userID); err == nil {
		if existing.LastVerifiedAt != nil {
			writeJSON(w, http.StatusConflict, map[string]string{
				"error":  "already_enrolled",
				"reason": "MFA is already enrolled for this user. Delete the existing enrollment first.",
			})
			return
		}
		// Abandoned pending enrollment — reap and continue.
		if err := h.enrollRepo.Delete(r.Context(), userID); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "stale enrollment cleanup failed"})
			return
		}
		_ = h.codesRepo.DeleteAll(r.Context(), userID)
	} else if !errors.Is(err, ErrMFANotEnrolled) {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "enrollment lookup failed"})
		return
	}

	accountName, err := h.userLookup(r.Context(), userID)
	if err != nil || accountName == "" {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "user lookup failed"})
		return
	}

	enrollment, err := h.totp.Enroll(r.Context(), accountName)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "totp generate failed"})
		return
	}

	ciphertext, dekWrapped, err := h.envelope.Encrypt([]byte(enrollment.Secret))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "encrypt failed"})
		return
	}

	if err := h.enrollRepo.Create(r.Context(), &MFAEnrollmentRow{
		UserID:               userID,
		TOTPSecretCT:         ciphertext,
		TOTPSecretDEKWrapped: dekWrapped,
		TOTPIssuer:           h.issuer,
	}); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "persist enrollment failed"})
		return
	}

	// The enrollment response carries the plaintext TOTP secret (shown in
	// the QR code). Disable caching so intermediate proxies, service
	// workers, or browser back-forward cache cannot retain it.
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	writeJSON(w, http.StatusOK, mfaEnrollResponse{
		Secret:     enrollment.Secret,
		OtpauthURL: enrollment.OtpauthURL,
		Issuer:     h.issuer,
	})
}

// VerifyEnrollment takes the first TOTP code for a pending enrollment,
// verifies it, marks the enrollment as active (last_verified_at), and
// generates + persists + returns the recovery codes (shown once).
func (h *MFAHandler) VerifyEnrollment(w http.ResponseWriter, r *http.Request) {
	if h.envelope == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "mfa_unavailable"})
		return
	}

	userID, ok := h.authedUserID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthenticated"})
		return
	}

	var req mfaVerifyEnrollmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Code == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "code required"})
		return
	}

	row, err := h.enrollRepo.GetByUserID(r.Context(), userID)
	if err != nil {
		if errors.Is(err, ErrMFANotEnrolled) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "no pending enrollment"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "enrollment lookup failed"})
		return
	}

	secret, err := h.envelope.Decrypt(row.TOTPSecretCT, row.TOTPSecretDEKWrapped)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "decrypt failed"})
		return
	}

	ok, err = h.totp.Verify(r.Context(), string(secret), req.Code)
	if err != nil || !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid code"})
		return
	}

	// Activate enrollment by stamping last_verified_at.
	if err := h.enrollRepo.UpdateLastVerified(r.Context(), userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "activate failed"})
		return
	}

	// Generate + persist recovery codes. Any prior codes (from a previous
	// verify-enrollment attempt) are cleared first so the set returned here
	// is the only active set.
	codes, err := h.recovery.Generate()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "recovery generate failed"})
		return
	}
	if err := h.codesRepo.DeleteAll(r.Context(), userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "recovery reset failed"})
		return
	}
	if err := h.codesRepo.BulkInsert(r.Context(), userID, codes.Hashes); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "recovery persist failed"})
		return
	}

	// The verify-enrollment response carries the plaintext recovery codes
	// — shown exactly once, then discarded. Disable caching so no
	// intermediate storage (proxies, service workers, back-forward cache)
	// can retain a copy of this one-shot credential set.
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	writeJSON(w, http.StatusOK, mfaVerifyEnrollmentResponse{
		RecoveryCodes: codes.Plaintext,
	})
}

// VerifyTOTP is the login step-up endpoint. The caller passes the
// mfa_token it received from Login + a current TOTP code. On success,
// full access + refresh tokens are minted with mfa_verified=true.
func (h *MFAHandler) VerifyTOTP(w http.ResponseWriter, r *http.Request) {
	if h.envelope == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "mfa_unavailable"})
		return
	}

	var req mfaVerifyTOTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.Code == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "code required"})
		return
	}
	// PR #57 / S5-G2: the OAuth-MFA path no longer carries the challenge token
	// in the redirect URL (it would land in history/referrers/access logs).
	// The OAuth callback instead writes mfa_token into an HttpOnly,
	// SameSite=Lax cookie (see setMFAChallengeCookie in handler.go). The
	// password-then-MFA path still sends mfa_token in the JSON body. Honor
	// the body value first (back-compat), then fall back to the cookie.
	if req.MFAToken == "" {
		if c, err := r.Cookie(mfaChallengeCookieName); err == nil {
			req.MFAToken = strings.TrimSpace(c.Value)
		}
	}
	if req.MFAToken == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "mfa_token and code required"})
		return
	}

	// The challenge token is a regular JWT the caller's Handler.Login
	// issued with purpose=mfa_challenge. Parse it via the JWT service
	// so we get full signature+expiry validation for free.
	claims, err := h.parseChallengeToken(r.Context(), req.MFAToken)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid mfa token"})
		return
	}

	userID, err := uuid.Parse(claims.Sub)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid mfa token subject"})
		return
	}

	row, err := h.enrollRepo.GetByUserID(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "not enrolled"})
		return
	}

	secret, err := h.envelope.Decrypt(row.TOTPSecretCT, row.TOTPSecretDEKWrapped)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "decrypt failed"})
		return
	}

	ok, err := h.totp.Verify(r.Context(), string(secret), req.Code)
	if err != nil || !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid code"})
		return
	}

	// S-003: enforce single-use on the mfa_token. A successful TOTP
	// verification consumes the challenge so a subsequent replay with
	// the same mfa_token (even with a valid code) cannot re-issue a
	// session. Intentionally placed AFTER totp.Verify so a typo'd code
	// does not burn the challenge — users can retry with the same
	// mfa_token until they either succeed or the token expires.
	if !h.consumeChallengeToken(req.MFAToken) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "mfa token already used"})
		return
	}

	_ = h.enrollRepo.UpdateLastVerified(r.Context(), userID)

	// Resolve fresh workspace claims the same way Login does — roles may
	// have changed between Login and step-up (rare but correct).
	wsID := claims.WorkspaceID
	stateID := claims.StateID
	role := claims.Role
	platformRole := claims.PlatformRole
	if h.workspaceLookup != nil {
		if w2, s2, r2, p2, _ := h.workspaceLookup.GetUserWorkspace(r.Context(), claims.Sub); w2 != "" {
			wsID, stateID, role, platformRole = w2, s2, r2, p2
		}
	}

	accessToken, err := h.jwt.GenerateAccessToken(r.Context(), TokenClaims{
		Sub:          claims.Sub,
		WorkspaceID:  wsID,
		Role:         role,
		PlatformRole: platformRole,
		StateID:      stateID,
		MFAVerified:  true,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "token generation failed"})
		return
	}

	// F-013: each successful MFA step-up gets its own independent refresh
	// token family (unique UUID per session), mirroring the password Login
	// and OAuth paths. A deterministic family ID derived from the user's
	// subject would fold every MFA-verified session for a user into a single
	// family, so a single logout / token-reuse revocation would kill all of
	// them and the MaxSessions accounting would mis-count the second login as
	// the same family. Per-session families restore session isolation.
	refreshToken, err := h.jwt.GenerateRefreshTokenWithMFA(r.Context(), claims.Sub, "family-"+uuid.New().String(), wsID, role, platformRole, stateID, true)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "refresh token generation failed"})
		return
	}
	setRefreshTokenCookie(w, r, refreshToken)

	writeJSON(w, http.StatusOK, mfaVerifyTOTPResponse{
		AccessToken: accessToken,
	})
}

// VerifyRecoveryCode is the login step-up fallback when the user has
// lost access to their authenticator app. It takes the same
// short-lived mfa_token that Login issues + one of the user's one-time
// recovery codes (plaintext, as shown at enrollment). On success it
// issues full access/refresh tokens with mfa_verified=true, marks the
// code consumed atomically, and consumes the mfa_token via the same
// S-003 denylist that VerifyTOTP uses.
//
// Security notes:
//   - The mfa_token is not burned on a wrong code (same retry UX as
//     VerifyTOTP). The global per-IP rate limiter (10/min) applies.
//   - MarkConsumed runs an atomic UPDATE ... WHERE consumed_at IS NULL
//     so two concurrent consumes of the same code cannot both succeed.
//     If MarkConsumed returns an error on a bcrypt-match, we treat it
//     as a failure (the caller sees 401 "invalid recovery code"); the
//     row in the DB may still be unused in that edge case, so the user
//     can retry with the same code on the next request.
//   - CountActive after success is logged only, not returned, so a
//     response observer cannot infer how many recovery codes a user
//     has left. The Settings UI uses MFAHandler.Status for that.
func (h *MFAHandler) VerifyRecoveryCode(w http.ResponseWriter, r *http.Request) {
	if h.envelope == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "mfa_unavailable"})
		return
	}

	var req mfaVerifyRecoveryCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.MFAToken == "" || req.RecoveryCode == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "mfa_token and recovery_code required"})
		return
	}

	claims, err := h.parseChallengeToken(r.Context(), req.MFAToken)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid mfa token"})
		return
	}

	userID, err := uuid.Parse(claims.Sub)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid mfa token subject"})
		return
	}

	// Load the user's active recovery codes. We iterate and bcrypt-compare
	// each one; on match we atomically mark it consumed. A user has at
	// most 10 codes by default so the O(n) scan is trivial.
	rows, err := h.codesRepo.ListActive(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "recovery lookup failed"})
		return
	}
	if len(rows) == 0 {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "no active recovery codes"})
		return
	}

	var matchedID uuid.UUID
	matched := false
	for _, row := range rows {
		if h.recovery.Verify(req.RecoveryCode, row.CodeHash) {
			matchedID = row.ID
			matched = true
			break
		}
	}
	if !matched {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid recovery code"})
		return
	}

	// Atomic consume — if two requests race on the same code, only the
	// first MarkConsumed returns nil, and the second sees
	// "already consumed or not found" which we surface as 401.
	if err := h.codesRepo.MarkConsumed(r.Context(), matchedID); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid recovery code"})
		return
	}

	// Burn the mfa_token so the same challenge cannot be replayed with a
	// different recovery code or with a TOTP code. Mirrors the S-003
	// guard in VerifyTOTP.
	if !h.consumeChallengeToken(req.MFAToken) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "mfa token already used"})
		return
	}

	// Stamp last_verified_at so Status reflects a recent successful
	// step-up, even though the step-up was via recovery code and not a
	// TOTP code.
	_ = h.enrollRepo.UpdateLastVerified(r.Context(), userID)

	// Resolve fresh workspace claims (same pattern as VerifyTOTP).
	wsID := claims.WorkspaceID
	stateID := claims.StateID
	role := claims.Role
	platformRole := claims.PlatformRole
	if h.workspaceLookup != nil {
		if w2, s2, r2, p2, _ := h.workspaceLookup.GetUserWorkspace(r.Context(), claims.Sub); w2 != "" {
			wsID, stateID, role, platformRole = w2, s2, r2, p2
		}
	}

	accessToken, err := h.jwt.GenerateAccessToken(r.Context(), TokenClaims{
		Sub:          claims.Sub,
		WorkspaceID:  wsID,
		Role:         role,
		PlatformRole: platformRole,
		StateID:      stateID,
		MFAVerified:  true,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "token generation failed"})
		return
	}

	// F-013: per-session refresh token family (unique UUID), same as
	// VerifyTOTP and the password/OAuth Login paths. See the comment on the
	// VerifyTOTP call site for why a deterministic family ID breaks session
	// isolation and MaxSessions accounting.
	refreshToken, err := h.jwt.GenerateRefreshTokenWithMFA(r.Context(), claims.Sub, "family-"+uuid.New().String(), wsID, role, platformRole, stateID, true)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "refresh token generation failed"})
		return
	}
	setRefreshTokenCookie(w, r, refreshToken)

	writeJSON(w, http.StatusOK, mfaVerifyTOTPResponse{
		AccessToken: accessToken,
	})
}

// DeleteEnrollment wipes the caller's MFA enrollment and all associated
// recovery codes. Used by Settings → Security → "Disable MFA". The
// caller's authenticated session is the only credential required —
// stepping up through TOTP first would create a chicken-and-egg for
// users whose authenticator app is lost, which is what recovery codes
// exist for. Higher-trust operations (admin account reset, billing
// changes) remain behind separate step-up gates.
//
// This endpoint deliberately does NOT require password re-confirmation.
// Tightening it would be a cross-cutting UX decision for a future wave.
func (h *MFAHandler) DeleteEnrollment(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.authedUserID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthenticated"})
		return
	}

	if _, err := h.enrollRepo.GetByUserID(r.Context(), userID); err != nil {
		if errors.Is(err, ErrMFANotEnrolled) {
			// Idempotent — "not enrolled" and "just deleted" look the
			// same to the client.
			writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "enrollment lookup failed"})
		return
	}

	if err := h.enrollRepo.Delete(r.Context(), userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete enrollment failed"})
		return
	}
	// Recovery codes become meaningless once the enrollment is gone;
	// best-effort delete without surfacing the error.
	_ = h.codesRepo.DeleteAll(r.Context(), userID)

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Status reports the authenticated user's current enrollment state.
// Used by the settings UI to decide whether to show "Set up MFA" or
// "MFA active — regenerate recovery codes".
func (h *MFAHandler) Status(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.authedUserID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthenticated"})
		return
	}

	row, err := h.enrollRepo.GetByUserID(r.Context(), userID)
	if err != nil {
		if errors.Is(err, ErrMFANotEnrolled) {
			writeJSON(w, http.StatusOK, mfaStatusResponse{})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "status lookup failed"})
		return
	}

	count, _ := h.codesRepo.CountActive(r.Context(), userID)

	writeJSON(w, http.StatusOK, mfaStatusResponse{
		Enrolled:          row.DisabledAt == nil,
		VerifiedEnrolled:  row.LastVerifiedAt != nil,
		ActiveRecoveryCnt: count,
	})
}

// ─────────────────────────────── Helpers ───────────────────────────────

// authedUserID extracts the authenticated user ID from the request via
// the middleware JWT claim injection. Returns (uuid.Nil, false) when no
// claim is present — that case is the handler's 401 path.
//
// IMPORTANT (AGENTS.md hard rule): we MUST use the shared middleware
// context key via the auth package. A private context-key type in this
// package would silently never match the real middleware key. The
// real JWT middleware lives in internal/middleware. To keep the auth
// package free of a cycle, we expose an injection point: main.go (or
// tests) wire AuthedUserIDReader before mounting the handler.
func (h *MFAHandler) authedUserID(r *http.Request) (uuid.UUID, bool) {
	if authedUserIDReader == nil {
		return uuid.Nil, false
	}
	return authedUserIDReader(r)
}

// authedUserIDReader is the injection point for main.go to wire the
// middleware.JWTClaimsFromContext-based user ID extraction. It stays a
// package-level var (not a constructor param) because it only has one
// canonical implementation shared by every handler in the auth package.
var authedUserIDReader func(r *http.Request) (uuid.UUID, bool)

// SetAuthedUserIDReader wires the authenticated-user-ID reader. main.go
// calls this once during bootstrap after constructing the JWT middleware.
func SetAuthedUserIDReader(fn func(r *http.Request) (uuid.UUID, bool)) {
	authedUserIDReader = fn
}

// IssueMFAChallengeToken builds a short-lived JWT that the Login handler
// returns to the client when a mandatory-MFA role needs to step up. The
// VerifyTOTP endpoint accepts it as its credential.
//
// Exported so Handler.Login can call it without reimplementing the
// token-minting logic.
func (h *MFAHandler) IssueMFAChallengeToken(userID, workspaceID, role, platformRole, stateID string) (string, error) {
	return issueMFAChallengeToken(h.jwt, userID, workspaceID, role, platformRole, stateID, mfaChallengeExpiry)
}

// consumeChallengeToken atomically marks an mfa_token as used. Returns
// true if this call performed the consumption (the token was not
// previously used), false if the token has already been consumed within
// its validity window.
//
// The key is a sha256 hash of the raw token string so the in-memory map
// stays small regardless of JWT length. Opportunistic eviction sweeps
// up to 16 expired entries per call to keep the map bounded without
// spawning a background goroutine.
func (h *MFAHandler) consumeChallengeToken(tokenStr string) bool {
	if tokenStr == "" {
		return false
	}
	sum := sha256.Sum256([]byte(tokenStr))
	key := hex.EncodeToString(sum[:])

	nowFn := h.now
	if nowFn == nil {
		nowFn = time.Now
	}
	now := nowFn()
	// Keep the entry around for a full challenge expiry + 1 minute
	// buffer so a clock-skewed replay still gets caught.
	evictAt := now.Add(mfaChallengeExpiry + time.Minute)

	if _, loaded := h.consumedChallenges.LoadOrStore(key, evictAt); loaded {
		return false
	}

	// Opportunistic cleanup — delete up to 16 entries whose eviction
	// time has passed. Bounded work per call, no background goroutine.
	swept := 0
	h.consumedChallenges.Range(func(k, v any) bool {
		if ts, ok := v.(time.Time); ok && now.After(ts) {
			h.consumedChallenges.Delete(k)
			swept++
		}
		return swept < 16
	})

	return true
}

// parseChallengeToken verifies a challenge token and extracts its claims.
func (h *MFAHandler) parseChallengeToken(ctx context.Context, tokenStr string) (*TokenClaims, error) {
	// The challenge token rides the same RS256 signing key as the
	// access token — we reuse ParseAccessToken for signature+expiry
	// checks, then require the purpose claim to match.
	parsed, err := parseChallengeRaw(h.jwt, tokenStr)
	if err != nil {
		return nil, err
	}
	return parsed, nil
}

// ─────────────────────────────── Raw JWT helpers ───────────────────────────────

// issueMFAChallengeToken mints the short-lived step-up JWT. Kept as a
// package-private helper rather than a JWTService method so the auth
// interface stays focused on access/refresh semantics.
func issueMFAChallengeToken(svc JWTService, userID, workspaceID, role, platformRole, stateID string, expiry time.Duration) (string, error) {
	js, ok := svc.(*jwtService)
	if !ok {
		return "", errors.New("mfa: JWT service does not support raw signing")
	}
	now := time.Now()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub":           userID,
		"workspace_id":  workspaceID,
		"role":          role,
		"platform_role": platformRole,
		"state_id":      stateID,
		"purpose":       MFAChallengePurpose,
		"exp":           now.Add(expiry).Unix(),
		"iat":           now.Unix(),
	})
	return token.SignedString(js.privateKey)
}

// parseChallengeRaw parses and validates a challenge token.
func parseChallengeRaw(svc JWTService, tokenStr string) (*TokenClaims, error) {
	js, ok := svc.(*jwtService)
	if !ok {
		return nil, errors.New("mfa: JWT service does not support raw parsing")
	}
	token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return js.publicKey, nil
	})
	if err != nil {
		return nil, err
	}
	mapClaims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid challenge token")
	}
	purpose, _ := mapClaims["purpose"].(string)
	if purpose != MFAChallengePurpose {
		return nil, errors.New("token is not an MFA challenge")
	}
	sub, _ := mapClaims["sub"].(string)
	if sub == "" {
		return nil, errors.New("missing sub")
	}
	wsID, _ := mapClaims["workspace_id"].(string)
	role, _ := mapClaims["role"].(string)
	pRole, _ := mapClaims["platform_role"].(string)
	stID, _ := mapClaims["state_id"].(string)
	return &TokenClaims{
		Sub:          sub,
		WorkspaceID:  wsID,
		Role:         role,
		PlatformRole: pRole,
		StateID:      stID,
	}, nil
}
