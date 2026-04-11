package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// ──────────────────────────── Request / Response Types ────────────────────────────

type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	FullName string `json:"full_name"`
	State    string `json:"state,omitempty"` // Accepted from frontend; state is applied during onboarding flow
	Phone    string `json:"phone"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type RegisterResponse struct {
	Message string `json:"message"`
	UserID  string `json:"user_id,omitempty"`
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
