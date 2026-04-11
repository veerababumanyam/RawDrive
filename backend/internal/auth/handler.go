package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

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

type VerifyOTPResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type RefreshResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// ──────────────────────────── Dependencies ────────────────────────────

// UserService abstracts user creation and lookup for the auth handler.
type UserService interface {
	Create(ctx context.Context, email, password string) (string, error)
	FindByEmail(ctx context.Context, email string) (string, bool, error)
	VerifyPassword(ctx context.Context, email, password string) (string, bool, bool, error)
	MarkEmailVerified(ctx context.Context, userID string) error
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

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/register", h.Register)
	r.Post("/login", h.Login)
	r.Post("/verify-otp", h.VerifyOTP)
	r.Get("/oauth/google", h.OAuthGoogle)
	r.Get("/oauth/google/callback", h.OAuthGoogleCallback)
	r.Post("/refresh", h.RefreshToken)
	r.Post("/logout", h.Logout)
	return r
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

	// Create user with password
	userID, err := h.users.Create(r.Context(), req.Email, req.Password)
	if err != nil {
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

	refreshToken, err := h.jwt.GenerateRefreshTokenWithClaims(r.Context(), userID, "family-"+userID, wsID, role, platformRole, stateID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate refresh token"})
		return
	}

	// Set refresh token in HttpOnly cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    refreshToken,
		Path:     "/",
		HttpOnly: true,
		Secure:   true, // Should be true in production, using HTTPS
		SameSite: http.SameSiteStrictMode,
		MaxAge:   7 * 24 * 60 * 60, // 7 days
	})

	writeJSON(w, http.StatusOK, VerifyOTPResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
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

	refreshToken, err := h.jwt.GenerateRefreshTokenWithClaims(r.Context(), userID, "family-"+userID, wsID, role, platformRole, stateID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate refresh token"})
		return
	}

	writeJSON(w, http.StatusOK, VerifyOTPResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	})
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

	accessToken, err := h.jwt.GenerateAccessToken(r.Context(), TokenClaims{
		Sub:          user.ID,
		WorkspaceID:  oauthWsID,
		Role:         oauthRole,
		PlatformRole: oauthPlatformRole,
		StateID:      oauthStateID,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate token"})
		return
	}

	refreshToken, err := h.jwt.GenerateRefreshTokenWithClaims(r.Context(), user.ID, "family-"+user.ID, oauthWsID, oauthRole, oauthPlatformRole, oauthStateID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate refresh token"})
		return
	}

	http.Redirect(
		w,
		r,
		buildFrontendLoginRedirect(returnTo, fallbackOrigin, map[string]string{
			"access_token":  accessToken,
			"refresh_token": refreshToken,
		}),
		http.StatusFound,
	)
}

func (h *Handler) RefreshToken(w http.ResponseWriter, r *http.Request) {
	var req RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	newAccess, newRefresh, err := h.jwt.RotateRefreshToken(r.Context(), req.RefreshToken)
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

	writeJSON(w, http.StatusOK, RefreshResponse{
		AccessToken:  newAccess,
		RefreshToken: newRefresh,
	})
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	var req LogoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	// Inspect to find family, then revoke
	info, err := h.jwt.InspectRefreshToken(r.Context(), req.RefreshToken)
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
