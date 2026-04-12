package handler

import (
	"encoding/json"
	"net/http"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/user"
)

// ProfileHandler serves the authenticated user's own profile (read + update).
// Mounted at /api/v1/users/profile. The user ID comes from the JWT "sub"
// claim — callers cannot spoof another user.
type ProfileHandler struct {
	userSvc user.Service
}

// NewProfileHandler constructs a ProfileHandler backed by the given user service.
func NewProfileHandler(userSvc user.Service) *ProfileHandler {
	return &ProfileHandler{userSvc: userSvc}
}

// updateProfileRequest is the JSON body accepted by UpdateProfile. All fields
// are optional — omitted fields are left unchanged.
type updateProfileRequest struct {
	DisplayName *string `json:"display_name"`
	Phone       *string `json:"phone"`
	AvatarURL   *string `json:"avatar_url"`
}

// GetProfile returns the current user's profile.
func (h *ProfileHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	sub, _ := claims["sub"].(string)
	if sub == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	u, err := h.userSvc.GetByID(r.Context(), sub)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"id":           u.ID,
		"email":        u.Email,
		"phone":        u.Phone,
		"display_name": u.DisplayName,
		"avatar_url":   u.AvatarURL,
	})
}

// UpdateProfile applies a partial update to the authenticated user's profile.
func (h *ProfileHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	sub, _ := claims["sub"].(string)
	if sub == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req updateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	input := user.UpdateUserInput{
		DisplayName: req.DisplayName,
		AvatarURL:   req.AvatarURL,
		Phone:       req.Phone,
	}

	updated, err := h.userSvc.Update(r.Context(), sub, input)
	if err != nil {
		http.Error(w, `{"error":"failed to update profile"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"id":           updated.ID,
		"email":        updated.Email,
		"phone":        updated.Phone,
		"display_name": updated.DisplayName,
		"avatar_url":   updated.AvatarURL,
	})
}
