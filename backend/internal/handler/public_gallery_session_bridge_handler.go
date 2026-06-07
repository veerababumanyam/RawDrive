package handler

import (
	"encoding/json"
	"net/http"
	"strings"
)

type publicGallerySessionBridgeRequest struct {
	Slug  string `json:"slug"`
	Token string `json:"token"`
}

// HandlePublicGallerySessionBridge handles POST /api/public-gallery-session.
//
// Production nginx proxies rawdrive.in/api/* to the Go backend, so the Next.js
// app-router route with the same path is shadowed in production. Keep this
// endpoint intentionally equivalent to the frontend route: it only upgrades an
// already backend-minted gallery session into an HttpOnly same-origin cookie.
// The token is still validated by the normal public gallery access gates.
func HandlePublicGallerySessionBridge(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")

	var input publicGallerySessionBridgeRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}

	if strings.TrimSpace(input.Slug) == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "slug is required"})
		return
	}
	if strings.TrimSpace(input.Token) == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "token is required"})
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "gallery_session",
		Value:    input.Token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   requestIsHTTPS(r),
		MaxAge:   86400,
	})
	w.WriteHeader(http.StatusNoContent)
}

func requestIsHTTPS(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}
