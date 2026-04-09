package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/repository"
)

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

	if err := h.repo.Delete(r.Context(), category, key); err != nil {
		http.Error(w, `{"error":"failed to delete setting"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// RegisterAdminSettingsRoutes wires up the admin settings CRUD endpoints.
func RegisterAdminSettingsRoutes(r chi.Router, repo *repository.PlatformSettingsRepo) {
	h := NewAdminSettingsHandler(repo)
	r.Route("/api/v1/admin/settings", func(sr chi.Router) {
		sr.Get("/categories", h.ListCategories)
		sr.Get("/{category}", h.ListByCategory)
		sr.Get("/{category}/{key}", h.GetSetting)
		sr.Put("/{category}/{key}", h.UpsertSetting)
		sr.Delete("/{category}/{key}", h.DeleteSetting)
	})
}
