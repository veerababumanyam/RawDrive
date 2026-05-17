package auth

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
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
	// StateID is the REQUIRED id of the chosen Indian state or union
	// territory from the `states` table. Must be > 0; the handler rejects
	// the request otherwise. Actual persistence to users.state_id still
	// happens during onboarding (POST /onboarding/state) — at register
	// time we only validate presence so the signup form can enforce the
	// "pick a state" requirement consistently with the OAuth path.
	StateID int `json:"state_id"`
	// Plan is the user's self-serve plan intent captured at signup.
	// It is validated via normalizePlan; "enterprise" is sales-gated and
	// must be rejected at this boundary. Carried through the onboarding
	// flow to seed workspaces.plan_tier at workspace creation time.
	Plan string `json:"plan,omitempty"`
}

// selfServePlans is the whitelist of plan IDs that may be self-registered.
// Must stay in lockstep with frontend/src/lib/tokens.ts pricingPlans, minus
// "enterprise" which requires sales contact via /contact.
var selfServePlans = map[string]struct{}{
	"free":         {},
	"starter":      {},
	"professional": {},
	"business":     {},
}

// normalizePlan coerces a user-supplied plan id into a canonical self-serve
// value. Unknown / empty values fall back to "free" so a typo'd query param
// never blocks signup. "enterprise" is explicitly rejected by returning ok=false;
// callers surface a 400 with a message directing the user to sales.
func normalizePlan(p string) (plan string, ok bool) {
	p = strings.ToLower(strings.TrimSpace(p))
	if p == "enterprise" {
		return "", false
	}
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
	// StateID echoes the state id the user picked so onboarding can
	// preselect it without an extra request.
	StateID int `json:"state_id,omitempty"`
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
	MustChangePassword bool // true for admin-created dealer accounts until first password change
}

type UserService interface {
	Create(ctx context.Context, email, password, displayName, phone string, stateID int) (string, error)
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

// ──────────────────────────── Handler ────────────────────────────

type Handler struct {
	otp        OTPService
	jwt        JWTService
	oauth      *OAuthService
	users      UserService
	workspaces WorkspaceLookup
	// F-007 (M17 wave 2): MFA enrollment store for login step-up.
	// When nil, Login falls back to the pre-M17 password-only flow.
	mfaEnrollments MFAEnrollmentStore
	// mfaHandler is used to mint the challenge token when Login needs
	// to force step-up. When nil, no challenge can be issued so Login
	// also falls back to the pre-M17 flow.
	mfaHandler *MFAHandler
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

// WithMFA attaches the MFA enrollment store and handler so Login can
// step up users who have enrolled. Callers pass nil/nil to opt out.
// F-007 (M17 wave 2).
func (h *Handler) WithMFA(store MFAEnrollmentStore, mfaHandler *MFAHandler) *Handler {
	h.mfaEnrollments = store
	h.mfaHandler = mfaHandler
	return h
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
	// Pass selected claims through to the client so the frontend has a
	// single network call to populate its user-state store.
	writeJSON(w, http.StatusOK, map[string]any{
		"id":                   profile.ID,
		"email":                profile.Email,
		"phone":                profile.Phone,
		"display_name":         profile.DisplayName,
		"avatar_url":           profile.AvatarURL,
		"workspace_id":         claims.WorkspaceID,
		"role":                 claims.Role,
		"platform_role":        claims.PlatformRole,
		"state_id":             claims.StateID,
		"must_change_password": profile.MustChangePassword,
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

	if len(req.Password) < 8 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "password must be at least 8 characters"})
		return
	}

	// State selection is mandatory at register time. We do not look up
	// the id in the states table here — that would couple the auth
	// package to the states repo. Onboarding does the FK write against
	// users.state_id and will reject a bogus id there; at this layer we
	// only enforce "a non-zero id was supplied" so the signup UI cannot
	// bypass the dropdown and submit empty.
	if req.StateID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "state selection is required"})
		return
	}

	// Validate / canonicalize the self-serve plan intent. Enterprise is
	// sales-gated and must be rejected here; anything else falls back to
	// "free" via normalizePlan so a stray query-param typo never blocks signup.
	canonicalPlan, ok := normalizePlan(req.Plan)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "enterprise plan requires sales contact — please use /contact",
		})
		return
	}

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

	// Create user with password + mandatory state selection. StateID is
	// validated > 0 above; persisting it in the same INSERT closes the
	// gap where onboarding was the sole writer of users.state_id.
	userID, err := h.users.Create(r.Context(), req.Email, req.Password, req.FullName, req.Phone, req.StateID)
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
		log.Printf("auth.Register: create user failed email=%s: %v", req.Email, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create user"})
		return
	}

	// Generate OTP for activation
	_, err = h.otp.Generate(r.Context(), req.Email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate activation OTP"})
		return
	}

	writeJSON(w, http.StatusCreated, RegisterResponse{
		Message: "User registered successfully. Check your email for the OTP.",
		UserID:  userID,
		Plan:    canonicalPlan,
		StateID: req.StateID,
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
	if h.mfaEnrollments != nil && h.mfaHandler != nil {
		if uid, parseErr := uuid.Parse(userID); parseErr == nil {
			if row, mfaErr := h.mfaEnrollments.GetByUserID(r.Context(), uid); mfaErr == nil {
				if row.LastVerifiedAt != nil && row.DisabledAt == nil {
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
			}
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
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate refresh token"})
		return
	}

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
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate refresh token"})
		return
	}
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
		log.Printf("auth.ResendOTP: user lookup failed email=%s: %v", req.Email, err)
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
			log.Printf("auth.ResendOTP: otp generate failed email=%s: %v", req.Email, otpErr)
		}
	}

	writeJSON(w, http.StatusOK, ResendOTPResponse{Message: resendOTPGenericMessage})
}

func (h *Handler) OAuthGoogle(w http.ResponseWriter, r *http.Request) {
	if h.oauth == nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "OAuth not configured"})
		return
	}

	// State selection is mandatory at signup — including for Google
	// registration. The frontend must pass `intent=signup` plus the chosen
	// `state_id` query param when starting OAuth from /register. Login
	// (existing user) does NOT pass intent=signup, because state is already
	// set on their user row and the OAuth callback will find them by email.
	//
	// We validate presence server-side rather than threading the id into
	// the OAuth state map: actual persistence still lives in
	// /onboarding/state, which runs after the OAuth return and picks up
	// the stashed value from client-side sessionStorage. The purpose of
	// THIS check is solely to prevent a curl or tampered form from
	// starting a Google signup without a state selection — matching the
	// same 400 behavior as /auth/register.
	if strings.EqualFold(r.URL.Query().Get("intent"), "signup") {
		rawStateID := strings.TrimSpace(r.URL.Query().Get("state_id"))
		if rawStateID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "state selection is required"})
			return
		}
		stateID, convErr := strconv.Atoi(rawStateID)
		if convErr != nil || stateID <= 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "state selection is required"})
			return
		}
	}

	returnTo := sanitizeFrontendOrigin(r.URL.Query().Get("redirect_to"))
	if returnTo == "" {
		returnTo = sanitizeFrontendOrigin(os.Getenv("FRONTEND_URL"))
	}

	url, err := h.oauth.InitiateGoogleAuth(r.Context(), returnTo)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to initiate OAuth"})
		return
	}

	http.Redirect(w, r, url, http.StatusFound)
}

func (h *Handler) OAuthGoogleCallback(w http.ResponseWriter, r *http.Request) {
	if h.oauth == nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "OAuth not configured"})
		return
	}

	fallbackOrigin := sanitizeFrontendOrigin(os.Getenv("FRONTEND_URL"))
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	if code == "" || state == "" {
		http.Redirect(
			w,
			r,
			buildFrontendLoginRedirect("", fallbackOrigin, map[string]string{"error": "missing_state"}),
			http.StatusFound,
		)
		return
	}

	user, returnTo, err := h.oauth.HandleGoogleCallback(r.Context(), code, state)
	if err != nil {
		http.Redirect(
			w,
			r,
			buildFrontendLoginRedirect(returnTo, fallbackOrigin, map[string]string{"error": "oauth_failed"}),
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

	refreshToken, err := h.jwt.GenerateRefreshTokenWithClaims(r.Context(), user.ID, "family-"+uuid.New().String(), oauthWsID, oauthRole, oauthPlatformRole, oauthStateID)
	if err != nil {
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
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
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
				// Claims changed — regenerate access token with fresh data
				freshAccess, genErr := h.jwt.GenerateAccessToken(r.Context(), TokenClaims{
					Sub:          claims.Sub,
					WorkspaceID:  wsID,
					Role:         role,
					PlatformRole: platformRole,
					StateID:      stateID,
				})
				if genErr == nil {
					newAccess = freshAccess
				}
			}
		}
	}
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

const refreshTokenCookieName = "refresh_token"

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
	base := origin
	if base == "" {
		base = fallback
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
