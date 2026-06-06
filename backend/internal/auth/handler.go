package auth

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/logging"
	"github.com/rawdrive/backend/internal/passwordpolicy"
)

// ErrPhoneTaken is returned by UserService.Create when the phone column
// would violate users_phone_key. Defined here so the auth package can
// react (translate to 409) without importing the user package — which
// would create a cycle because user imports auth. The user package's
// AuthAdapter translates its own user.ErrPhoneTaken into this sentinel.
var ErrPhoneTaken = errors.New("auth: phone number already registered")

// ──────────────────────────── Request / Response Types ────────────────────────────

type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	FullName string `json:"full_name"`
	Phone    string `json:"phone"`
	// Plan is the user's self-serve plan intent captured at signup.
	// Validated via normalizePlan; unknown values fall back to "free".
	// Carried through onboarding to seed workspaces.plan_tier at creation.
	Plan     string `json:"plan,omitempty"`
	StateID  *int   `json:"state_id,omitempty"`
	District string `json:"district,omitempty"`
	// TermsAccepted mirrors the signup "I accept the Terms of Service and
	// Privacy Policy" checkbox. When true we record a one-time acceptance
	// (with timestamp, version, IP, user-agent) as IT Act §10A / DPDP evidence.
	TermsAccepted bool `json:"terms_accepted,omitempty"`
}

// selfServePlans is the whitelist of plan IDs that may be self-registered.
// Must stay in lockstep with the active self-serve subscription rows in
// subscription_plans and frontend/src/lib/tokens.ts pricingPlans.
var selfServePlans = map[string]struct{}{
	"free":             {},
	"creator":          {},
	"pro_photographer": {},
	"studio":           {},
}

// normalizePlan coerces a user-supplied plan id into a canonical self-serve
// value. Unknown / empty values fall back to "free" so a typo'd query param
// never blocks signup.
func normalizePlan(p string) (plan string, ok bool) {
	p = strings.ToLower(strings.TrimSpace(p))
	if _, allowed := selfServePlans[p]; allowed {
		return p, true
	}
	return "free", true
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type RegisterResponse struct {
	Message string `json:"message"`
	UserID  string `json:"user_id,omitempty"`
	// Plan echoes the canonicalized self-serve plan accepted by the server.
	// The frontend uses this to confirm what the user was enrolled under
	// (e.g., after an unknown plan was coerced to "free").
	Plan string `json:"plan,omitempty"`
}

type VerifyOTPRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

// ResendOTPRequest carries the email whose activation code should be
// reissued. The handler intentionally returns the same response envelope
// for "account exists & unverified", "account exists & already verified",
// and "no such account" so callers cannot enumerate accounts.
type ResendOTPRequest struct {
	Email string `json:"email"`
}

// ResendOTPResponse is the single-shape body returned by ResendOTP.
// Generic message — no info about account state — so callers cannot
// distinguish unverified / verified / unknown emails from the response.
type ResendOTPResponse struct {
	Message string `json:"message"`
}

type VerifyOTPResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type RefreshResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
}

type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// ──────────────────────────── Dependencies ────────────────────────────

// UserService abstracts user creation and lookup for the auth handler.
// UserProfile is the minimal view of a user exposed by GET /auth/me.
// Kept small and display-oriented so we do not leak password hashes or
// verification state to the client.
type UserProfile struct {
	ID                 string
	Email              string
	Phone              string
	DisplayName        string
	AvatarURL          string
	StateID            *int
	District           string
	MustChangePassword bool // true for admin-created dealer accounts until first password change
}

type UserService interface {
	Create(ctx context.Context, email, password, displayName, phone string, stateID *int, district string) (string, error)
	FindByEmail(ctx context.Context, email string) (string, bool, error)
	VerifyPassword(ctx context.Context, email, password string) (string, bool, bool, error)
	MarkEmailVerified(ctx context.Context, userID string) error
	// GetProfileByID returns the display fields for a user. Returns
	// (nil, false, nil) when no user with that id exists so handlers can
	// translate that into a 404 without an error log.
	GetProfileByID(ctx context.Context, userID string) (*UserProfile, bool, error)
	// IsEmailVerified reports whether the account exists and has completed
	// activation. Returns (verified, exists, error).
	IsEmailVerified(ctx context.Context, email string) (verified, exists bool, err error)
	// ChangePassword verifies the current password and replaces it with the
	// new one. Clears must_change_password on success.
	ChangePassword(ctx context.Context, userID, currentPassword, newPassword string) error
}

// WorkspaceLookup resolves a user's primary workspace, state, workspace role, and platform role.
type WorkspaceLookup interface {
	// GetUserWorkspace returns (workspaceID, stateID, workspaceRole, platformRole, error).
	// Returns ("","","","",nil) if user has no workspace yet (needs onboarding).
	GetUserWorkspace(ctx context.Context, userID string) (string, string, string, string, error)
}

// PlanTierLookup retrieves the subscription plan for a workspace.
// Returns ("free", nil, nil, nil) when no active subscription row exists.
type PlanTierLookup interface {
	GetWorkspacePlanTier(ctx context.Context, workspaceID string) (tier string, startedAt, expiresAt *time.Time, err error)
}

// TermsManager records Terms-of-Service / copyright acceptance and reports a
// user's terms status. Declared here (not imported from the service package)
// because the service package imports auth — importing it back would create a
// cycle. The concrete *service.TermsService satisfies this interface.
type TermsManager interface {
	AcceptTerms(ctx context.Context, userID uuid.UUID, method, ip, ua string) (string, error)
	TermsStatusForUser(ctx context.Context, userID uuid.UUID) (needsAcceptance bool, acceptedVersion string, acceptedAt *time.Time, currentVersion string, err error)
}

// ──────────────────────────── Handler ────────────────────────────

type Handler struct {
	otp        OTPService
	jwt        JWTService
	oauth      *OAuthService
	users      UserService
	workspaces WorkspaceLookup
	planTier   PlanTierLookup
	// F-007 (M17 wave 2): MFA enrollment store for login step-up.
	// When nil, Login falls back to the pre-M17 password-only flow.
	mfaEnrollments MFAEnrollmentStore
	// mfaHandler is used to mint the challenge token when Login needs
	// to force step-up. When nil, no challenge can be issued so Login
	// also falls back to the pre-M17 flow.
	mfaHandler *MFAHandler
	// terms records ToS/copyright acceptance at registration and surfaces
	// per-user terms status in /me. When nil, registration captures nothing
	// and /me omits the terms object (the upload gate still enforces).
	terms TermsManager
}

func NewHandler(otp OTPService, jwt JWTService, oauth *OAuthService, users UserService) *Handler {
	return &Handler{
		otp:   otp,
		jwt:   jwt,
		oauth: oauth,
		users: users,
	}
}

// WithWorkspaceLookup attaches a workspace resolver to the handler.
func (h *Handler) WithWorkspaceLookup(wl WorkspaceLookup) *Handler {
	h.workspaces = wl
	return h
}

// WithPlanTierLookup attaches a plan/subscription resolver used by Me().
func (h *Handler) WithPlanTierLookup(ptl PlanTierLookup) *Handler {
	h.planTier = ptl
	return h
}

// WithMFA attaches the MFA enrollment store and handler so Login can
// step up users who have enrolled. Callers pass nil/nil to opt out.
// F-007 (M17 wave 2).
func (h *Handler) WithMFA(store MFAEnrollmentStore, mfaHandler *MFAHandler) *Handler {
	h.mfaEnrollments = store
	h.mfaHandler = mfaHandler
	return h
}

// WithTerms attaches the Terms-of-Service acceptance manager so Register can
// capture acceptance and Me can report status. Pass nil to opt out.
func (h *Handler) WithTerms(t TermsManager) *Handler {
	h.terms = t
	return h
}

// clientIPForAudit returns the best-effort client IP for an audit record.
// The auth package cannot import the middleware package (import cycle), so the
// proxy-aware extraction is mirrored here: X-Forwarded-For, then X-Real-IP,
// then the TCP RemoteAddr with the port stripped.
func clientIPForAudit(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.Index(xff, ","); i >= 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	if xri := strings.TrimSpace(r.Header.Get("X-Real-IP")); xri != "" {
		return xri
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// Routes returns the auth subrouter. Note: /register, /login, and
// /verify-otp are DELIBERATELY NOT registered here — they are mounted
// at the ROOT router level in cmd/api/main.go with a tighter per-IP
// rate limiter (5/min), matching the pattern already used for the
// MFA verify endpoints. This keeps auth rate-limit policy centralized
// in main.go and avoids an auth→middleware→repository→auth import
// cycle that would otherwise block wiring the limiter here.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/oauth/google", h.OAuthGoogle)
	r.Get("/oauth/google/status", h.OAuthGoogleStatus)
	r.Get("/oauth/google/callback", h.OAuthGoogleCallback)
	r.Post("/refresh", h.RefreshToken)
	r.Post("/logout", h.Logout)
	// GET /auth/me returns the logged-in user's display profile. Reads
	// the JWT claims out of the request context (populated by the auth
	// middleware up-stack in main.go) and loads the user row. Used by
	// the dashboard to greet the actual user instead of a hardcoded
	// placeholder name. Added 2026-04-12 in response to UAT findings.
	r.Get("/me", h.Me)
	r.Post("/change-password", h.ChangePassword)
	return r
}

// ChangePassword verifies the caller's current password and replaces it with
// the new one. Clears must_change_password so the first-login redirect does
// not loop. Requires a valid Bearer token (no MFA bypass path).
func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthenticated"})
		return
	}
	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
	claims, err := h.jwt.ParseAccessToken(r.Context(), tokenStr)
	if err != nil || claims == nil || claims.Sub == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthenticated"})
		return
	}
	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.CurrentPassword == "" || req.NewPassword == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "current_password and new_password are required"})
		return
	}
	if err := h.users.ChangePassword(r.Context(), claims.Sub, req.CurrentPassword, req.NewPassword); err != nil {
		switch err.Error() {
		case "wrong current password":
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "current password is incorrect"})
		case "password does not meet complexity requirements":
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		default:
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to change password"})
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// Me returns the display profile for the user identified by the access
// token in the request. The auth middleware must have already populated
// the JWT claims into the request context — without a sub claim we
// return 401. The response is intentionally small: id, email, display
// name, avatar url. Password hashes, verification flags, MFA state and
// other sensitive fields are NOT included.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	// The auth package cannot import middleware (import cycle), so we
	// parse the bearer token here. JWT verification and expiry checks
	// live in ParseAccessToken; a parse failure is indistinguishable
	// from an unauthenticated request as far as this endpoint cares.
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthenticated"})
		return
	}
	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
	claims, err := h.jwt.ParseAccessToken(r.Context(), tokenStr)
	if err != nil || claims == nil || claims.Sub == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthenticated"})
		return
	}
	profile, found, err := h.users.GetProfileByID(r.Context(), claims.Sub)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load profile"})
		return
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "user not found"})
		return
	}
	// Fetch subscription plan tier when the workspace is known.
	var planTier string
	var subStartedAt, subExpiresAt *time.Time
	if h.planTier != nil && claims.WorkspaceID != "" {
		tier, sa, ea, _ := h.planTier.GetWorkspacePlanTier(r.Context(), claims.WorkspaceID)
		planTier = tier
		subStartedAt = sa
		subExpiresAt = ea
	}

	// Terms-of-Service / copyright acceptance status. Lets the frontend
	// pre-check whether to prompt before an upload without a separate call.
	// Nil (omitted) when the terms manager is unwired or lookup fails — the
	// frontend treats that as "unknown" and relies on the backend upload gate.
	var termsStatus map[string]any
	if h.terms != nil {
		if uid, perr := uuid.Parse(claims.Sub); perr == nil {
			needs, accVer, accAt, curVer, terr := h.terms.TermsStatusForUser(r.Context(), uid)
			if terr == nil {
				termsStatus = map[string]any{
					"needs_acceptance": needs,
					"accepted_version": accVer,
					"accepted_at":      accAt,
					"current_version":  curVer,
				}
			}
		}
	}

	// Pass selected claims through to the client so the frontend has a
	// single network call to populate its user-state store.
	writeJSON(w, http.StatusOK, map[string]any{
		"id":                      profile.ID,
		"email":                   profile.Email,
		"phone":                   profile.Phone,
		"display_name":            profile.DisplayName,
		"avatar_url":              profile.AvatarURL,
		"workspace_id":            claims.WorkspaceID,
		"role":                    claims.Role,
		"platform_role":           claims.PlatformRole,
		"state_id":                claims.StateID,
		"district":                profile.District,
		"must_change_password":    profile.MustChangePassword,
		"plan_tier":               planTier,
		"subscription_started_at": subStartedAt,
		"subscription_expires_at": subExpiresAt,
		"terms":                   termsStatus,
	})
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if !isValidEmail(req.Email) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid email"})
		return
	}

	if len(req.Password) < 12 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "password must be at least 12 characters"})
		return
	}

	// F-056: reject over-long passwords before the password ever reaches the
	// hashing site in h.users.Create. bcrypt's limit is 72 bytes.
	if err := passwordpolicy.ValidateBcryptInput("password", req.Password); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	if strings.TrimSpace(req.Phone) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "phone number is required"})
		return
	}

	// Validate / canonicalize the self-serve plan intent. Unknown values fall
	// back to "free" so a stray query-param typo never blocks signup.
	canonicalPlan, _ := normalizePlan(req.Plan)

	// Check if user already exists
	_, exists, err := h.users.FindByEmail(r.Context(), req.Email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if exists {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "email already registered"})
		return
	}

	userID, err := h.users.Create(r.Context(), req.Email, req.Password, req.FullName, req.Phone, req.StateID, req.District)
	if err != nil {
		// Phone is unique in the users table (users_phone_key). A second
		// registration with an already-taken phone used to surface as an
		// opaque 500 "failed to create user" — indistinguishable from a
		// real server error and impossible for the user to self-correct.
		// Translate it to a targeted 409 with an actionable message, same
		// shape as the duplicate-email path above.
		if errors.Is(err, ErrPhoneTaken) {
			writeJSON(w, http.StatusConflict, map[string]string{
				"error": "phone number is already registered — use a different number or log in instead",
			})
			return
		}
		// Any other DB error: log the underlying cause so future drift is
		// visible in the server log instead of vanishing. Response body
		// stays generic to avoid leaking DB internals to the client.
		log.Printf("auth.Register: create user failed email=%s: %v", maskEmail(req.Email), err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create user"})
		return
	}

	// One-time Terms-of-Service / copyright acceptance capture. The frontend
	// gates the signup button on the checkbox and sends terms_accepted=true; we
	// persist the acceptance with IP + user-agent as IT Act §10A / DPDP
	// evidence. Best-effort: a failure here is logged but does NOT fail
	// registration — the upload terms gate re-prompts if it did not persist.
	if req.TermsAccepted && h.terms != nil {
		if uid, perr := uuid.Parse(userID); perr == nil {
			if _, terr := h.terms.AcceptTerms(r.Context(), uid, "registration", clientIPForAudit(r), r.UserAgent()); terr != nil {
				log.Printf("auth.Register: terms acceptance capture failed user=%s: %v", userID, terr)
			}
		}
	}

	// Generate OTP for activation
	_, err = h.otp.Generate(r.Context(), req.Email)
	if err != nil {
		// 2026-05-18: log the underlying cause so the actual reason
		// (SMTP delivery failure, rate limit, etc.) is visible in the
		// server log instead of vanishing behind the generic message
		// shown to the client.
		log.Printf("auth.Register: OTP generation failed email=%s: %v", maskEmail(req.Email), err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate activation OTP"})
		return
	}

	writeJSON(w, http.StatusCreated, RegisterResponse{
		Message: "User registered successfully. Check your email for the OTP.",
		UserID:  userID,
		Plan:    canonicalPlan,
	})
}

// Login is for standard password login
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if !isValidEmail(req.Email) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid email"})
		return
	}

	userID, emailVerified, exists, err := h.users.VerifyPassword(r.Context(), req.Email, req.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if !exists {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid email or password"})
		return
	}
	if !emailVerified {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "account not activated"})
		return
	}

	// Resolve user's workspace, state, workspace role, and platform role
	wsID := "pending-onboarding"
	stateID := "pending-onboarding"
	role := "Owner"
	platformRole := "photographer"
	if h.workspaces != nil {
		resolvedWS, resolvedState, resolvedRole, resolvedPlatformRole, _ := h.workspaces.GetUserWorkspace(r.Context(), userID)
		if resolvedWS != "" {
			wsID = resolvedWS
		}
		if resolvedState != "" {
			stateID = resolvedState
		}
		if resolvedRole != "" {
			role = resolvedRole
		}
		if resolvedPlatformRole != "" {
			platformRole = resolvedPlatformRole
		}
	}

	// F-007 (M17 wave 2): MFA step-up. If the user has a verified TOTP
	// enrollment, issue a short-lived challenge token instead of full
	// access tokens. The client then POSTs to /auth/verify-totp with
	// the challenge + a current code to finish authentication.
	//
	// Wave 2 is opt-in: only users who have actively enrolled trigger
	// the step-up path. Mandatory enforcement for un-enrolled
	// photographer + staff roles lands in wave 3 along with the grace
	// window UI and the frontend enrollment wizard.
	if h.requiresMFAStepUp(r.Context(), userID) {
		mfaToken, err := h.mfaHandler.IssueMFAChallengeToken(userID, wsID, role, platformRole, stateID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to issue mfa challenge"})
			return
		}
		writeJSON(w, http.StatusUnauthorized, map[string]interface{}{
			"mfa_required": true,
			"mfa_token":    mfaToken,
			"challenge":    "totp",
		})
		return
	}

	// Generate tokens
	accessToken, err := h.jwt.GenerateAccessToken(r.Context(), TokenClaims{
		Sub:          userID,
		WorkspaceID:  wsID,
		Role:         role,
		PlatformRole: platformRole,
		StateID:      stateID,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate access token"})
		return
	}

	refreshToken, err := h.jwt.GenerateRefreshTokenWithClaims(r.Context(), userID, "family-"+uuid.New().String(), wsID, role, platformRole, stateID)
	if err != nil {
		if errors.Is(err, ErrMaxConcurrentSessions) {
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too many active sessions — sign out from another device and try again"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate refresh token"})
		return
	}

	setAccessTokenCookie(w, r, h.jwt, accessToken)
	setRefreshTokenCookie(w, r, refreshToken)

	writeJSON(w, http.StatusOK, VerifyOTPResponse{
		AccessToken: accessToken,
	})
}

func (h *Handler) VerifyOTP(w http.ResponseWriter, r *http.Request) {
	var req VerifyOTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	valid, err := h.otp.Validate(r.Context(), req.Email, req.Code)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "verification failed"})
		return
	}
	if !valid {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid or expired OTP"})
		return
	}

	// Look up user
	userID, exists, err := h.users.FindByEmail(r.Context(), req.Email)
	if err != nil || !exists {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "user not found"})
		return
	}

	// Mark user's email as verified
	if err := h.users.MarkEmailVerified(r.Context(), userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to activate account"})
		return
	}

	// Resolve user's workspace, state, workspace role, and platform role
	wsID := "pending-onboarding"
	stateID := "pending-onboarding"
	role := "Owner"
	platformRole := "photographer"
	if h.workspaces != nil {
		resolvedWS, resolvedState, resolvedRole, resolvedPlatformRole, _ := h.workspaces.GetUserWorkspace(r.Context(), userID)
		if resolvedWS != "" {
			wsID = resolvedWS
		}
		if resolvedState != "" {
			stateID = resolvedState
		}
		if resolvedRole != "" {
			role = resolvedRole
		}
		if resolvedPlatformRole != "" {
			platformRole = resolvedPlatformRole
		}
	}

	// Generate tokens
	accessToken, err := h.jwt.GenerateAccessToken(r.Context(), TokenClaims{
		Sub:          userID,
		WorkspaceID:  wsID,
		Role:         role,
		PlatformRole: platformRole,
		StateID:      stateID,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate access token"})
		return
	}

	refreshToken, err := h.jwt.GenerateRefreshTokenWithClaims(r.Context(), userID, "family-"+uuid.New().String(), wsID, role, platformRole, stateID)
	if err != nil {
		if errors.Is(err, ErrMaxConcurrentSessions) {
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too many active sessions — sign out from another device and try again"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate refresh token"})
		return
	}
	setAccessTokenCookie(w, r, h.jwt, accessToken)
	setRefreshTokenCookie(w, r, refreshToken)

	writeJSON(w, http.StatusOK, VerifyOTPResponse{
		AccessToken: accessToken,
	})
}

// resendOTPGenericMessage is the single user-visible response from
// ResendOTP. The wording is intentionally indeterminate about whether
// an account exists or its verification state so callers cannot use
// this endpoint to enumerate accounts. The OTP delivery (if any) is a
// side effect; the response shape is the same in every code path.
const resendOTPGenericMessage = "If an unverified account exists for this email, a new activation code has been sent."

// ResendOTP reissues an activation OTP for an unverified account. The
// activation OTP is normally sent once at registration time; this
// endpoint exists so a user who missed / lost the original email can
// recover without re-registering (which would 409 on the duplicate
// email anyway). Companion to /auth/verify-otp from /activate.
//
// Account enumeration resistance: the response body is identical for
// "unverified account → OTP generated", "verified account → no-op",
// and "no such account → no-op". Callers cannot infer the state of an
// email from this response. Rate limiting is provided by the same
// per-IP credLimiter that protects /auth/login and /auth/register
// (wired in cmd/api/main.go), plus OTPService.Generate's own
// per-identifier rate-limit window.
func (h *Handler) ResendOTP(w http.ResponseWriter, r *http.Request) {
	var req ResendOTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if !isValidEmail(req.Email) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid email"})
		return
	}

	// Look up verification state. We do NOT branch the response on the
	// outcome — every code path below ends in the same 200 envelope.
	// Errors from the user store are logged but not surfaced; the
	// caller is treated as "no account" so we never leak DB problems.
	verified, exists, err := h.users.IsEmailVerified(r.Context(), req.Email)
	if err != nil {
		log.Printf("auth.ResendOTP: user lookup failed email=%s: %v", maskEmail(req.Email), err)
		writeJSON(w, http.StatusOK, ResendOTPResponse{Message: resendOTPGenericMessage})
		return
	}

	// Side-effect: only mint a new OTP for an unverified, existing
	// account. The OTPService.Generate call has its own per-identifier
	// rate limiter; if that returns rate-limit-exceeded we still answer
	// the caller with the same generic 200 (the original OTP is still
	// valid for its lifetime and another can be requested after the
	// window resets).
	if exists && !verified {
		if _, otpErr := h.otp.Generate(r.Context(), req.Email); otpErr != nil {
			log.Printf("auth.ResendOTP: otp generate failed email=%s: %v", maskEmail(req.Email), otpErr)
		}
	}

	writeJSON(w, http.StatusOK, ResendOTPResponse{Message: resendOTPGenericMessage})
}

func (h *Handler) OAuthGoogle(w http.ResponseWriter, r *http.Request) {
	fallbackOrigin := defaultFrontendOrigin()
	returnTo := sanitizeAllowedFrontendOrigin(r.URL.Query().Get("redirect_to"))
	if returnTo == "" {
		returnTo = fallbackOrigin
	}

	if h.oauth == nil || !h.oauth.IsConfigured() {
		http.Redirect(
			w,
			r,
			buildFrontendLoginRedirect(returnTo, fallbackOrigin, map[string]string{"error": string(OAuthErrConfigUnavailable)}),
			http.StatusFound,
		)
		return
	}

	start, err := h.oauth.InitiateGoogleAuth(r.Context(), returnTo)
	if err != nil {
		log.Printf("auth.OAuthGoogle: initiate failed: %v", err)
		http.Redirect(
			w,
			r,
			buildFrontendLoginRedirect(returnTo, fallbackOrigin, map[string]string{"error": string(OAuthErrConfigUnavailable)}),
			http.StatusFound,
		)
		return
	}
	// S1-G3 / AREA-AUTH-2: bind the signed state to this browser via an
	// HttpOnly, SameSite=Lax cookie. HandleGoogleCallback requires the callback's
	// signed state to match this cookie (and rejects replays), so a captured or
	// replayed state value is useless from any other client.
	setOAuthStateCookie(w, r, start.CookieValue, start.ExpiresAt)

	http.Redirect(w, r, start.RedirectURL, http.StatusFound)
}

// OAuthGoogleStatus reports whether Google OAuth is configured so the
// frontend can hide the "Sign in with Google" button instead of letting
// the user click into a 500 "OAuth not configured". Public, unauthenticated.
func (h *Handler) OAuthGoogleStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"enabled": h.oauth != nil && h.oauth.IsConfigured()})
}

// requiresMFAStepUp reports whether the given user must complete a TOTP
// step-up before receiving full tokens. It returns true only when MFA is
// wired (store + handler present), the userID parses, and the user has a
// verified, non-disabled enrollment. This is the single source of truth
// for the opt-in step-up rule shared by the password Login and Google
// OAuth paths — keeping them in lockstep so OAuth can never silently skip
// the second factor that password login enforces.
func (h *Handler) requiresMFAStepUp(ctx context.Context, userID string) bool {
	if h.mfaEnrollments == nil || h.mfaHandler == nil {
		return false
	}
	uid, parseErr := uuid.Parse(userID)
	if parseErr != nil {
		return false
	}
	row, mfaErr := h.mfaEnrollments.GetByUserID(ctx, uid)
	if mfaErr != nil {
		return false
	}
	return row.LastVerifiedAt != nil && row.DisabledAt == nil
}

func (h *Handler) OAuthGoogleCallback(w http.ResponseWriter, r *http.Request) {
	if h.oauth == nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "OAuth not configured"})
		return
	}

	fallbackOrigin := defaultFrontendOrigin()
	defer clearOAuthStateCookie(w, r)
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	stateCookie := ""
	if cookie, err := r.Cookie(oauthStateCookieName); err == nil {
		stateCookie = cookie.Value
	}
	if code == "" || state == "" {
		http.Redirect(
			w,
			r,
			buildFrontendLoginRedirect("", fallbackOrigin, map[string]string{"error": "missing_state"}),
			http.StatusFound,
		)
		return
	}

	// S1-G3 / AREA-AUTH-2: HandleGoogleCallback binds the signed state to this
	// browser by requiring the callback's signed state to match the value in the
	// HttpOnly oauth_state cookie (read above into stateCookie). The deferred
	// clearOAuthStateCookie plus the service's single-use replay map make the
	// state unusable a second time within its TTL.
	user, returnTo, err := h.oauth.HandleGoogleCallback(r.Context(), code, state, stateCookie)
	if err != nil {
		errorCode := "oauth_failed"
		redirectParams := map[string]string{"error": errorCode}
		var oauthErr *OAuthCallbackError
		if errors.As(err, &oauthErr) {
			switch oauthErr.Code {
			case OAuthErrStateInvalid, OAuthErrStateExpired:
				errorCode = string(oauthErr.Code)
			case OAuthErrEmailUnverified,
				OAuthErrAccountNotActivated,
				OAuthErrGoogleLinkConflict,
				OAuthErrRawDriveLinkConflict,
				OAuthErrAccountConflict,
				OAuthErrTokenInvalid,
				OAuthErrConfigUnavailable:
				errorCode = string(oauthErr.Code)
			}
			redirectParams["error"] = errorCode
			if oauthErr.Code == OAuthErrAccountNotActivated {
				redirectParams["email"] = strings.TrimSpace(oauthErr.Details["email"])
			}
		}
		log.Printf("auth.OAuthGoogleCallback: failed code=%s err=%v", errorCode, err)
		http.Redirect(
			w,
			r,
			buildFrontendLoginRedirect(returnTo, fallbackOrigin, redirectParams),
			http.StatusFound,
		)
		return
	}

	// Generate tokens for the authenticated user
	oauthWsID := "pending-onboarding"
	oauthStateID := "pending-onboarding"
	oauthRole := "Owner"
	oauthPlatformRole := "photographer"
	if h.workspaces != nil {
		rws, rst, rrl, rpr, _ := h.workspaces.GetUserWorkspace(r.Context(), user.ID)
		if rws != "" {
			oauthWsID = rws
		}
		if rst != "" {
			oauthStateID = rst
		}
		if rrl != "" {
			oauthRole = rrl
		}
		if rpr != "" {
			oauthPlatformRole = rpr
		}
	}

	// F-007 (M17 wave 2): MFA step-up on the OAuth path. Same opt-in rule
	// as the password Login handler — if the user has a verified, active
	// TOTP enrollment we must NOT issue full tokens here. Instead mint a
	// short-lived challenge token and redirect the frontend to the TOTP
	// step-up page. The client then POSTs to /auth/verify-totp to finish
	// authentication. Without this gate an enrolled user could bypass the
	// second factor entirely by logging in via Google.
	if h.requiresMFAStepUp(r.Context(), user.ID) {
		mfaToken, mfaTokErr := h.mfaHandler.IssueMFAChallengeToken(user.ID, oauthWsID, oauthRole, oauthPlatformRole, oauthStateID)
		if mfaTokErr != nil {
			http.Redirect(
				w,
				r,
				buildFrontendLoginRedirect(returnTo, fallbackOrigin, map[string]string{"error": "oauth_failed"}),
				http.StatusFound,
			)
			return
		}
		// S5-G2: never put the MFA challenge token in the redirect query string
		// (it lands in browser history, referrers, and server access logs).
		// Carry it in a short-lived HttpOnly cookie instead and signal only the
		// step-up requirement in the URL.
		setMFAChallengeCookie(w, r, mfaToken)
		http.Redirect(
			w,
			r,
			buildFrontendLoginRedirect(returnTo, fallbackOrigin, map[string]string{
				"mfa_required": "1",
				"challenge":    "totp",
			}),
			http.StatusFound,
		)
		return
	}

	refreshToken, err := h.jwt.GenerateRefreshTokenWithClaims(r.Context(), user.ID, "family-"+uuid.New().String(), oauthWsID, oauthRole, oauthPlatformRole, oauthStateID)
	if err != nil {
		if errors.Is(err, ErrMaxConcurrentSessions) {
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too many active sessions — sign out from another device and try again"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate refresh token"})
		return
	}
	setRefreshTokenCookie(w, r, refreshToken)

	http.Redirect(
		w,
		r,
		buildFrontendLoginRedirect(returnTo, fallbackOrigin, map[string]string{
			"authenticated": "1",
		}),
		http.StatusFound,
	)
}

func (h *Handler) RefreshToken(w http.ResponseWriter, r *http.Request) {
	var req RefreshRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	refreshToken := refreshTokenFromRequest(r, req.RefreshToken)
	if refreshToken == "" {
		// OBS-1: no refresh credential presented = "no active session", the
		// normal state for a logged-out visitor whose SPA probes on mount.
		// Answer 204 so the browser console/network panel does not flag a red
		// 4xx on every public page load. A *present but invalid* token still
		// returns 401 from RotateRefreshToken below.
		w.WriteHeader(http.StatusNoContent)
		return
	}

	newAccess, newRefresh, err := h.jwt.RotateRefreshToken(r.Context(), refreshToken)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid refresh token"})
		return
	}

	// Re-resolve workspace claims from DB so post-onboarding refresh
	// picks up the newly created workspace instead of "pending-onboarding".
	if h.workspaces != nil {
		claims, parseErr := h.jwt.ParseAccessToken(r.Context(), newAccess)
		if parseErr == nil && claims.Sub != "" {
			wsID, stateID, role, platformRole, _ := h.workspaces.GetUserWorkspace(r.Context(), claims.Sub)
			if wsID != "" && wsID != claims.WorkspaceID {
				// Claims changed — regenerate access token with fresh data.
				// Carry MFAVerified forward from the rotated token so a
				// post-onboarding refresh never silently downgrades a
				// verified TOTP session (AGENTS.md: "refresh token rotation
				// preserves mfa_verified").
				freshAccess, genErr := h.jwt.GenerateAccessToken(r.Context(), TokenClaims{
					Sub:          claims.Sub,
					WorkspaceID:  wsID,
					Role:         role,
					PlatformRole: platformRole,
					StateID:      stateID,
					MFAVerified:  claims.MFAVerified,
				})
				if genErr == nil {
					newAccess = freshAccess
				}
			}
		}
	}
	setAccessTokenCookie(w, r, h.jwt, newAccess)
	setRefreshTokenCookie(w, r, newRefresh)

	writeJSON(w, http.StatusOK, RefreshResponse{
		AccessToken: newAccess,
	})
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	var req LogoutRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	refreshToken := refreshTokenFromRequest(r, req.RefreshToken)
	clearAccessTokenCookie(w, r)
	clearRefreshTokenCookie(w, r)
	if refreshToken == "" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Inspect to find family, then revoke
	info, err := h.jwt.InspectRefreshToken(r.Context(), refreshToken)
	if err != nil {
		// Even if token is unknown, return 204 (don't leak info)
		w.WriteHeader(http.StatusNoContent)
		return
	}

	_ = h.jwt.RevokeSession(r.Context(), info.FamilyID)
	w.WriteHeader(http.StatusNoContent)
}

// ──────────────────────────── Helpers ────────────────────────────

// maskEmail redacts an email address for logging so user PII (F-070) does not
// persist in log aggregators. It is a thin delegate to logging.MaskEmail (the
// single source of truth, shared with the service/handler packages); retained
// so the existing auth call sites and MaskEmailForTest keep their signature.
func maskEmail(email string) string {
	return logging.MaskEmail(email)
}

func isValidEmail(email string) bool {
	if len(email) < 3 {
		return false
	}
	atIdx := -1
	for i, c := range email {
		if c == '@' {
			atIdx = i
		}
	}
	if atIdx < 1 || atIdx >= len(email)-1 {
		return false
	}
	// Must have a dot after @
	dotFound := false
	for i := atIdx + 1; i < len(email); i++ {
		if email[i] == '.' {
			dotFound = true
		}
	}
	return dotFound
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

const (
	AccessTokenCookieName  = "rawdrive_access_token"
	refreshTokenCookieName = "refresh_token"
	oauthStateCookieName   = "rawdrive_oauth_state"
	mfaChallengeCookieName = "rawdrive_mfa_challenge"
)

func AccessTokenFromRequest(r *http.Request) string {
	if r == nil {
		return ""
	}
	if authHeader := r.Header.Get("Authorization"); authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			return strings.TrimSpace(parts[1])
		}
	}
	if cookie, err := r.Cookie(AccessTokenCookieName); err == nil {
		return strings.TrimSpace(cookie.Value)
	}
	return ""
}

func setOAuthStateCookie(w http.ResponseWriter, r *http.Request, value string, expiresAt time.Time) {
	maxAge := int(time.Until(expiresAt).Seconds())
	if maxAge < 1 {
		maxAge = 1
	}
	http.SetCookie(w, &http.Cookie{
		Name:     oauthStateCookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   refreshCookieSecure(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   maxAge,
		Expires:  expiresAt,
	})
}

func clearOAuthStateCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     oauthStateCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   refreshCookieSecure(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

func setMFAChallengeCookie(w http.ResponseWriter, r *http.Request, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     mfaChallengeCookieName,
		Value:    token,
		Path:     "/auth",
		HttpOnly: true,
		Secure:   refreshCookieSecure(r),
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int(mfaChallengeExpiry.Seconds()),
	})
}

func clearMFAChallengeCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     mfaChallengeCookieName,
		Value:    "",
		Path:     "/auth",
		HttpOnly: true,
		Secure:   refreshCookieSecure(r),
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	})
}

func mfaChallengeTokenFromRequest(r *http.Request, fallback string) string {
	if token := strings.TrimSpace(fallback); token != "" {
		return token
	}
	if r == nil {
		return ""
	}
	if cookie, err := r.Cookie(mfaChallengeCookieName); err == nil {
		return strings.TrimSpace(cookie.Value)
	}
	return ""
}

func setAccessTokenCookie(w http.ResponseWriter, r *http.Request, jwtSvc JWTService, token string) {
	maxAge := int((15 * time.Minute).Seconds())
	if jwtSvc != nil {
		if claims, err := jwtSvc.ParseAccessToken(r.Context(), token); err == nil && claims != nil && !claims.ExpiresAt.IsZero() {
			if seconds := int(time.Until(claims.ExpiresAt).Seconds()); seconds > 0 {
				maxAge = seconds
			}
		}
	}
	http.SetCookie(w, &http.Cookie{
		Name:     AccessTokenCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   refreshCookieSecure(r),
		SameSite: http.SameSiteStrictMode,
		MaxAge:   maxAge,
	})
}

func clearAccessTokenCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     AccessTokenCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   refreshCookieSecure(r),
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	})
}

func setRefreshTokenCookie(w http.ResponseWriter, r *http.Request, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshTokenCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   refreshCookieSecure(r),
		SameSite: http.SameSiteStrictMode,
		MaxAge:   7 * 24 * 60 * 60,
	})
}

func clearRefreshTokenCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshTokenCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   refreshCookieSecure(r),
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	})
}

func refreshTokenFromRequest(r *http.Request, fallback string) string {
	if cookie, err := r.Cookie(refreshTokenCookieName); err == nil {
		if token := strings.TrimSpace(cookie.Value); token != "" {
			return token
		}
	}
	return strings.TrimSpace(fallback)
}

func refreshCookieSecure(r *http.Request) bool {
	appEnv := strings.ToLower(os.Getenv("APP_ENV"))
	if appEnv == "production" || appEnv == "prod" {
		return true
	}
	if r != nil {
		if r.TLS != nil {
			return true
		}
		if strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
			return true
		}
	}
	return false
}

func defaultFrontendOrigin() string {
	for _, envName := range []string{"FRONTEND_URL", "APP_PUBLIC_BASE_URL"} {
		if origin := sanitizeAllowedFrontendOrigin(os.Getenv(envName)); origin != "" {
			return origin
		}
	}
	return ""
}

func sanitizeAllowedFrontendOrigin(candidate string) string {
	origin := sanitizeFrontendOrigin(candidate)
	if origin == "" {
		return ""
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}
	if parsed.Scheme == "http" && !isLoopbackHost(parsed.Hostname()) {
		return ""
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return ""
	}
	if isConfiguredFrontendOrigin(origin) {
		return origin
	}
	if isDevelopmentEnv() && isLoopbackHost(parsed.Hostname()) {
		return origin
	}
	return ""
}

func isConfiguredFrontendOrigin(origin string) bool {
	for _, envName := range []string{"FRONTEND_URL", "APP_PUBLIC_BASE_URL"} {
		if configured := sanitizeFrontendOrigin(os.Getenv(envName)); configured != "" && configured == origin {
			return true
		}
	}
	return false
}

func isDevelopmentEnv() bool {
	appEnv := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	goEnv := strings.ToLower(strings.TrimSpace(os.Getenv("GO_ENV")))
	if appEnv == "" && goEnv == "" {
		return true
	}
	switch appEnv {
	case "development", "dev", "local", "test":
		return true
	}
	switch goEnv {
	case "development", "dev", "local", "test":
		return true
	}
	return false
}

func isLoopbackHost(host string) bool {
	host = strings.TrimSpace(strings.ToLower(host))
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func sanitizeFrontendOrigin(candidate string) string {
	candidate = strings.TrimSpace(candidate)
	if candidate == "" {
		return ""
	}

	parsed, err := url.Parse(candidate)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}

	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return ""
	}

	return (&url.URL{Scheme: parsed.Scheme, Host: parsed.Host}).String()
}

func buildFrontendLoginRedirect(origin, fallback string, params map[string]string) string {
	base := sanitizeAllowedFrontendOrigin(origin)
	if base == "" {
		base = sanitizeAllowedFrontendOrigin(fallback)
	}

	target := &url.URL{Path: "/login"}
	if base != "" {
		if parsed, err := url.Parse(base); err == nil {
			target = parsed
			target.Path = "/login"
			target.RawPath = ""
		}
	}

	query := target.Query()
	for key, value := range params {
		if strings.TrimSpace(value) != "" {
			query.Set(key, value)
		}
	}
	target.RawQuery = query.Encode()
	return target.String()
}
