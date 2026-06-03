package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
)

// validCategories is the allowlist of platform-settings categories. It mirrors
// the canonical set documented in platform_settings_repo.go and AGENTS.md
// (storage, auth, payments, ai, email, messaging). Without this gate a
// super_admin could create setting rows under arbitrary, undefined categories,
// polluting the platform_settings table with categories no part of the app
// reads. Note: this is NOT an encryption gate — encryption is driven off the
// per-setting is_secret flag in the repo, not the category.
var validCategories = map[string]struct{}{
	"storage":   {},
	"auth":      {},
	"payments":  {},
	"ai":        {},
	"email":     {},
	"messaging": {},
}

// isValidCategory reports whether category is in the allowlist.
func isValidCategory(category string) bool {
	_, ok := validCategories[category]
	return ok
}

// AdminSettingsHandler handles platform settings CRUD for super admins.
type AdminSettingsHandler struct {
	repo *repository.PlatformSettingsRepo
}

// NewAdminSettingsHandler creates a new AdminSettingsHandler.
func NewAdminSettingsHandler(repo *repository.PlatformSettingsRepo) *AdminSettingsHandler {
	return &AdminSettingsHandler{repo: repo}
}

// ListCategories handles GET /api/v1/admin/settings/categories
func (h *AdminSettingsHandler) ListCategories(w http.ResponseWriter, r *http.Request) {
	cats, err := h.repo.ListCategories(r.Context())
	if err != nil {
		http.Error(w, `{"error":"failed to list categories"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, cats)
}

// ListByCategory handles GET /api/v1/admin/settings/{category}
func (h *AdminSettingsHandler) ListByCategory(w http.ResponseWriter, r *http.Request) {
	category := chi.URLParam(r, "category")
	if !isValidCategory(category) {
		http.Error(w, `{"error":"invalid category"}`, http.StatusBadRequest)
		return
	}
	settings, err := h.repo.ListByCategory(r.Context(), category)
	if err != nil {
		http.Error(w, `{"error":"failed to list settings"}`, http.StatusInternalServerError)
		return
	}

	// Mask secret values in response — show only last 4 chars
	for i := range settings {
		if settings[i].IsSecret && len(settings[i].Value) > 4 {
			settings[i].Value = "••••" + settings[i].Value[len(settings[i].Value)-4:]
		}
	}

	respondJSON(w, http.StatusOK, settings)
}

// GetSetting handles GET /api/v1/admin/settings/{category}/{key}
func (h *AdminSettingsHandler) GetSetting(w http.ResponseWriter, r *http.Request) {
	category := chi.URLParam(r, "category")
	key := chi.URLParam(r, "key")

	if !isValidCategory(category) {
		http.Error(w, `{"error":"invalid category"}`, http.StatusBadRequest)
		return
	}

	setting, err := h.repo.GetByKey(r.Context(), category, key)
	if err != nil || setting == nil {
		http.Error(w, `{"error":"setting not found"}`, http.StatusNotFound)
		return
	}

	if setting.IsSecret && len(setting.Value) > 4 {
		setting.Value = "••••" + setting.Value[len(setting.Value)-4:]
	}

	respondJSON(w, http.StatusOK, setting)
}

// UpsertSetting handles PUT /api/v1/admin/settings/{category}/{key}
func (h *AdminSettingsHandler) UpsertSetting(w http.ResponseWriter, r *http.Request) {
	category := chi.URLParam(r, "category")
	key := chi.URLParam(r, "key")

	if !isValidCategory(category) {
		http.Error(w, `{"error":"invalid category"}`, http.StatusBadRequest)
		return
	}

	userID, _ := getUserID(r)

	var input struct {
		Value       string `json:"value"`
		IsSecret    bool   `json:"is_secret"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	if err := h.repo.Upsert(r.Context(), category, key, input.Value, input.IsSecret, input.Description, &userID); err != nil {
		http.Error(w, `{"error":"failed to save setting"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
}

// DeleteSetting handles DELETE /api/v1/admin/settings/{category}/{key}
func (h *AdminSettingsHandler) DeleteSetting(w http.ResponseWriter, r *http.Request) {
	category := chi.URLParam(r, "category")
	key := chi.URLParam(r, "key")

	if !isValidCategory(category) {
		http.Error(w, `{"error":"invalid category"}`, http.StatusBadRequest)
		return
	}

	if err := h.repo.Delete(r.Context(), category, key); err != nil {
		http.Error(w, `{"error":"failed to delete setting"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// RegisterAdminSettingsRoutes wires up the admin settings CRUD endpoints.
//
// These routes are mounted on the JWT-only `api` group in main.go, which is a
// more-specific mount than the guarded `/api/v1/admin` group — chi routes
// requests to this subrouter, so the platform-role gate MUST be applied here.
// Without it, any authenticated workspace user could read/enumerate setting
// metadata and overwrite or delete platform secrets (B2, SMTP, JWT, payment
// keys). Reads are restricted to platform staff (super_admin + admin, mirroring
// the /api/v1/admin group); mutations (PUT/DELETE) require super_admin
// specifically, since they can rotate/destroy platform secrets.
func RegisterAdminSettingsRoutes(r chi.Router, repo *repository.PlatformSettingsRepo) {
	h := NewAdminSettingsHandler(repo)
	r.Route("/api/v1/admin/settings", func(sr chi.Router) {
		// Base gate: only platform staff may read/enumerate settings,
		// mirroring the RequirePlatformRole("super_admin", "admin") gate on
		// the rest of the /api/v1/admin group (see admin_routes.go).
		sr.Use(middleware.RequirePlatformRole("super_admin", "admin"))

		sr.Get("/categories", h.ListCategories)
		sr.Get("/{category}", h.ListByCategory)
		sr.Get("/{category}/{key}", h.GetSetting)

		// Mutations are higher-severity and require super_admin specifically.
		sr.Group(func(mr chi.Router) {
			mr.Use(middleware.RequirePlatformRole("super_admin"))
			mr.Put("/{category}/{key}", h.UpsertSetting)
			mr.Delete("/{category}/{key}", h.DeleteSetting)
		})
	})
}
