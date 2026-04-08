package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// ──────────────────────────── Request / Response Types ────────────────────────────

type RegisterRequest struct {
	Email string `json:"email"`
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
	Create(ctx context.Context, email string) (string, error)
	FindByEmail(ctx context.Context, email string) (string, bool, error)
}

// WorkspaceLookup resolves a user's primary workspace and state.
type WorkspaceLookup interface {
	// GetUserWorkspace returns (workspaceID, stateID, error).
	// Returns ("","",nil) if user has no workspace yet (needs onboarding).
	GetUserWorkspace(ctx context.Context, userID string) (string, string, error)
}

// ──────────────────────────── Handler ────────────────────────────

type Handler struct {
	otp        OTPService
	jwt        JWTService
	oauth      *OAuthService
	users      UserService
	workspaces WorkspaceLookup
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

	// Create user
	userID, err := h.users.Create(r.Context(), req.Email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create user"})
		return
	}

	// Generate OTP
	_, err = h.otp.Generate(r.Context(), req.Email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate OTP"})
		return
	}

	writeJSON(w, http.StatusCreated, RegisterResponse{
		Message: "OTP sent to email",
		UserID:  userID,
	})
}

// Login sends an OTP to an existing user (for returning users).
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if !isValidEmail(req.Email) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid email"})
		return
	}

	// Check user exists
	_, exists, err := h.users.FindByEmail(r.Context(), req.Email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if !exists {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "user not found, please register first"})
		return
	}

	// Generate and send OTP
	_, err = h.otp.Generate(r.Context(), req.Email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate OTP"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "OTP sent to email"})
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

	// Resolve user's workspace and state
	wsID := "pending-onboarding"
	stateID := "pending-onboarding"
	role := "Owner"
	if h.workspaces != nil {
		resolvedWS, resolvedState, _ := h.workspaces.GetUserWorkspace(r.Context(), userID)
		if resolvedWS != "" {
			wsID = resolvedWS
		}
		if resolvedState != "" {
			stateID = resolvedState
		}
	}

	// Generate tokens
	accessToken, err := h.jwt.GenerateAccessToken(r.Context(), TokenClaims{
		Sub:         userID,
		WorkspaceID: wsID,
		Role:        role,
		StateID:     stateID,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate access token"})
		return
	}

	refreshToken, err := h.jwt.GenerateRefreshTokenWithClaims(r.Context(), userID, "family-"+userID, wsID, role, stateID)
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

	url, err := h.oauth.InitiateGoogleAuth(r.Context())
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

	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	if code == "" || state == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing code or state"})
		return
	}

	user, err := h.oauth.HandleGoogleCallback(r.Context(), code, state)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "OAuth callback failed"})
		return
	}

	// Generate tokens for the authenticated user
	oauthWsID := "pending-onboarding"
	oauthStateID := "pending-onboarding"
	if h.workspaces != nil {
		rws, rst, _ := h.workspaces.GetUserWorkspace(r.Context(), user.ID)
		if rws != "" {
			oauthWsID = rws
		}
		if rst != "" {
			oauthStateID = rst
		}
	}

	accessToken, err := h.jwt.GenerateAccessToken(r.Context(), TokenClaims{
		Sub:         user.ID,
		WorkspaceID: oauthWsID,
		Role:        "Owner",
		StateID:     oauthStateID,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate token"})
		return
	}

	refreshToken, err := h.jwt.GenerateRefreshTokenWithClaims(r.Context(), user.ID, "family-"+user.ID, oauthWsID, "Owner", oauthStateID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate refresh token"})
		return
	}

	// Redirect to frontend with tokens as query params (frontend stores them)
	http.Redirect(w, r, fmt.Sprintf("/login?access_token=%s&refresh_token=%s", accessToken, refreshToken), http.StatusFound)
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
