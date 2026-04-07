package auth

import (
	"context"
	"encoding/json"
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

// ──────────────────────────── Handler ────────────────────────────

type Handler struct {
	otp          OTPService
	jwt          JWTService
	oauth        *OAuthService
	users        UserService
}

func NewHandler(otp OTPService, jwt JWTService, oauth *OAuthService, users UserService) *Handler {
	return &Handler{
		otp:   otp,
		jwt:   jwt,
		oauth: oauth,
		users: users,
	}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/register", h.Register)
	r.Post("/verify-otp", h.VerifyOTP)
	r.Get("/oauth/google", h.OAuthGoogle)
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

	// Generate tokens
	accessToken, err := h.jwt.GenerateAccessToken(r.Context(), TokenClaims{
		Sub:         userID,
		WorkspaceID: "ws-default",
		Role:        "Owner",
		StateID:     "state-default",
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate access token"})
		return
	}

	refreshToken, err := h.jwt.GenerateRefreshToken(r.Context(), userID, "family-"+userID)
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
