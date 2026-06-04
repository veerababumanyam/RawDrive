package handler

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/storage"
)

const profileAvatarMaxBytes = 12 << 20

type PhotographerProfileHandler struct {
	profiles      *repository.PhotographerProfileRepo
	galleries     *repository.GalleryRepo
	store         storage.Provider
	publicBaseURL string
}

func NewPhotographerProfileHandler(
	profiles *repository.PhotographerProfileRepo,
	galleries *repository.GalleryRepo,
	store storage.Provider,
) *PhotographerProfileHandler {
	return &PhotographerProfileHandler{
		profiles:  profiles,
		galleries: galleries,
		store:     store,
	}
}

func (h *PhotographerProfileHandler) WithPublicBaseURL(baseURL string) *PhotographerProfileHandler {
	h.publicBaseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	return h
}

func (h *PhotographerProfileHandler) RegisterProtectedRoutes(r chi.Router) {
	r.Get("/api/v1/profile", h.GetMine)
	r.Post("/api/v1/profile", h.SaveMine)
	r.Put("/api/v1/profile", h.SaveMine)
	r.Put("/api/v1/profile/publish", h.PublishMine)
	r.Put("/api/v1/profile/unpublish", h.UnpublishMine)
	r.Post("/api/v1/profile/avatar/upload", h.UploadAvatar)
	r.Post("/api/v1/profile/avatar/crop", h.CropAvatar)
	r.Get("/api/v1/profile/avatar/preview", h.AvatarPreview)
	r.Get("/api/v1/profile/galleries", h.ListSelectableGalleries)
	r.Post("/api/v1/profile/galleries/featured", h.AddFeaturedGallery)
	r.Delete("/api/v1/profile/galleries/featured/{gallery_id}", h.RemoveFeaturedGallery)
	r.Put("/api/v1/profile/galleries/category", h.UpdateCategoryGalleries)
	r.Put("/api/v1/profile/visibility", h.UpdateVisibility)
	r.Put("/api/v1/profile/theme", h.UpdateTheme)
	r.Put("/api/v1/profile/seo", h.UpdateSEO)
	r.Get("/api/v1/profile/qr", h.GetQR)
	r.Get("/api/v1/profile/vcard", h.GetVCard)
}

func (h *PhotographerProfileHandler) RegisterPublicRoutes(r chi.Router) {
	r.Get("/api/v1/profile/{slug}", h.GetPublic)
	r.Post("/api/v1/profile/{slug}/view", h.TrackPublicView)
}

func (h *PhotographerProfileHandler) GetMine(w http.ResponseWriter, r *http.Request) {
	userID, workspaceID, ok := currentProfileActor(w, r)
	if !ok {
		return
	}
	profile, err := h.profiles.GetByOwner(r.Context(), userID, workspaceID)
	if err != nil {
		if errors.Is(err, repository.ErrPhotographerProfileNotFound) {
			respondJSON(w, http.StatusOK, map[string]any{
				"profile":    nil,
				"public_url": "",
			})
			return
		}
		http.Error(w, `{"error":"failed to load profile"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"profile":    profile,
		"public_url": h.profileURL(r, profile),
	})
}

func (h *PhotographerProfileHandler) SaveMine(w http.ResponseWriter, r *http.Request) {
	userID, workspaceID, ok := currentProfileActor(w, r)
	if !ok {
		return
	}
	var req repository.PhotographerProfile
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	req.PhotographerID = userID
	req.WorkspaceID = workspaceID

	existing, err := h.profiles.GetByOwner(r.Context(), userID, workspaceID)
	if err != nil && !errors.Is(err, repository.ErrPhotographerProfileNotFound) {
		http.Error(w, `{"error":"failed to load profile"}`, http.StatusInternalServerError)
		return
	}
	if existing != nil {
		req.ProfileID = existing.ProfileID
		req.CreatedAt = existing.CreatedAt
		req.TotalProfileViews = existing.TotalProfileViews
		req.UniqueVisitors = existing.UniqueVisitors
		req.LastViewedAt = existing.LastViewedAt
	}
	if req.URLSlug != "" {
		slug, err := h.uniqueSlug(r.Context(), req.ProfileID, req.URLSlug)
		if err != nil {
			http.Error(w, `{"error":"url_slug is unavailable"}`, http.StatusConflict)
			return
		}
		req.URLSlug = slug
	}
	if req.IsPublic {
		issues, err := h.publicProfileRequirements(r.Context(), &req)
		if err != nil {
			http.Error(w, `{"error":"failed to validate public profile"}`, http.StatusInternalServerError)
			return
		}
		if len(issues) > 0 {
			http.Error(w, fmt.Sprintf(`{"error":"public profile is incomplete","missing":%s}`, mustJSON(issues)), http.StatusBadRequest)
			return
		}
		now := time.Now()
		req.Status = "published"
		if existing != nil && existing.PublishedAt != nil {
			req.PublishedAt = existing.PublishedAt
		} else {
			req.PublishedAt = &now
		}
		if req.MetaTitle == "" {
			req.MetaTitle = firstNonEmptyProfileValue(req.DisplayName, req.BusinessName, strings.TrimSpace(req.FirstName+" "+req.LastName)) + " - Wedding Photographer"
		}
		if req.MetaDescription == "" {
			req.MetaDescription = defaultProfileDescription(&req)
		}
	} else {
		req.Status = "draft"
		req.PublishedAt = nil
	}
	saved, err := h.profiles.Upsert(r.Context(), &req)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to save profile: %s"}`, jsonEscape(err.Error())), http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"profile":    saved,
		"public_url": h.profileURL(r, saved),
	})
}

func (h *PhotographerProfileHandler) PublishMine(w http.ResponseWriter, r *http.Request) {
	userID, workspaceID, ok := currentProfileActor(w, r)
	if !ok {
		return
	}
	profile, err := h.profiles.GetByOwner(r.Context(), userID, workspaceID)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, repository.ErrPhotographerProfileNotFound) {
			status = http.StatusBadRequest
		}
		http.Error(w, `{"error":"save profile before publishing"}`, status)
		return
	}
	issues, err := h.publicProfileRequirements(r.Context(), profile)
	if err != nil {
		http.Error(w, `{"error":"failed to validate public profile"}`, http.StatusInternalServerError)
		return
	}
	if len(issues) > 0 {
		http.Error(w, fmt.Sprintf(`{"error":"public profile is incomplete","missing":%s}`, mustJSON(issues)), http.StatusBadRequest)
		return
	}
	slug, err := h.uniqueSlug(r.Context(), profile.ProfileID, profile.URLSlug)
	if err != nil {
		http.Error(w, `{"error":"url_slug is unavailable"}`, http.StatusConflict)
		return
	}
	now := time.Now()
	profile.URLSlug = slug
	profile.Status = "published"
	profile.IsPublic = true
	profile.PublishedAt = &now
	if profile.MetaTitle == "" {
		profile.MetaTitle = profile.DisplayName + " - Wedding Photographer"
	}
	if profile.MetaDescription == "" {
		profile.MetaDescription = defaultProfileDescription(profile)
	}
	saved, err := h.profiles.Upsert(r.Context(), profile)
	if err != nil {
		http.Error(w, `{"error":"failed to publish profile"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"profile":    saved,
		"public_url": h.profileURL(r, saved),
	})
}

func (h *PhotographerProfileHandler) UnpublishMine(w http.ResponseWriter, r *http.Request) {
	userID, workspaceID, ok := currentProfileActor(w, r)
	if !ok {
		return
	}
	profile, err := h.profiles.GetByOwner(r.Context(), userID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"profile not found"}`, http.StatusNotFound)
		return
	}
	profile.Status = "draft"
	profile.IsPublic = false
	profile.PublishedAt = nil
	saved, err := h.profiles.Upsert(r.Context(), profile)
	if err != nil {
		http.Error(w, `{"error":"failed to unpublish profile"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"profile":    saved,
		"public_url": h.profileURL(r, saved),
	})
}

func (h *PhotographerProfileHandler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	userID, workspaceID, ok := currentProfileActor(w, r)
	if !ok {
		return
	}
	profile, err := h.profiles.GetByOwner(r.Context(), userID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"save last_name before uploading avatar"}`, http.StatusBadRequest)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, profileAvatarMaxBytes)
	if err := r.ParseMultipartForm(profileAvatarMaxBytes); err != nil {
		http.Error(w, `{"error":"avatar upload is too large or invalid"}`, http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("avatar")
	if err != nil {
		http.Error(w, `{"error":"avatar file is required"}`, http.StatusBadRequest)
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, profileAvatarMaxBytes))
	if err != nil {
		http.Error(w, `{"error":"failed to read avatar"}`, http.StatusBadRequest)
		return
	}
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = http.DetectContentType(data[:min(len(data), 512)])
	}
	if !strings.HasPrefix(strings.ToLower(contentType), "image/") {
		http.Error(w, `{"error":"avatar must be an image"}`, http.StatusBadRequest)
		return
	}
	pos := service.AvatarCropPosition{Zoom: 1, Aspect: 1}
	cropped, err := service.RenderAvatarCropWebP(r.Context(), bytes.NewReader(data), pos, 640)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to crop avatar: %s"}`, jsonEscape(err.Error())), http.StatusBadRequest)
		return
	}

	avatarID := uuid.New()
	ext := profileImageExt(header.Filename, contentType)
	originalKey := fmt.Sprintf("profiles/%s/%s/avatar/%s/original%s", workspaceID, profile.ProfileID, avatarID, ext)
	croppedKey := fmt.Sprintf("profiles/%s/%s/avatar/%s/crop.webp", workspaceID, profile.ProfileID, avatarID)
	if err := h.store.Put(r.Context(), originalKey, bytes.NewReader(data), int64(len(data)), contentType); err != nil {
		http.Error(w, `{"error":"failed to store avatar"}`, http.StatusInternalServerError)
		return
	}
	if err := h.store.Put(r.Context(), croppedKey, bytes.NewReader(cropped), int64(len(cropped)), "image/webp"); err != nil {
		http.Error(w, `{"error":"failed to store avatar crop"}`, http.StatusInternalServerError)
		return
	}
	now := time.Now()
	profile.AvatarURL = originalKey
	profile.AvatarCroppedURL = croppedKey
	profile.AvatarUploadedAt = &now
	profile.AvatarPosition = json.RawMessage(`{"x":0,"y":0,"zoom":1,"aspect":1}`)
	saved, err := h.profiles.Upsert(r.Context(), profile)
	if err != nil {
		http.Error(w, `{"error":"failed to save avatar"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"profile": saved})
}

func (h *PhotographerProfileHandler) CropAvatar(w http.ResponseWriter, r *http.Request) {
	userID, workspaceID, ok := currentProfileActor(w, r)
	if !ok {
		return
	}
	profile, err := h.profiles.GetByOwner(r.Context(), userID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"profile not found"}`, http.StatusNotFound)
		return
	}
	if profile.AvatarURL == "" {
		http.Error(w, `{"error":"upload avatar before cropping"}`, http.StatusBadRequest)
		return
	}
	var pos service.AvatarCropPosition
	if err := json.NewDecoder(r.Body).Decode(&pos); err != nil {
		http.Error(w, `{"error":"invalid crop body"}`, http.StatusBadRequest)
		return
	}
	rc, err := h.store.Get(r.Context(), profile.AvatarURL)
	if err != nil {
		http.Error(w, `{"error":"avatar original not found"}`, http.StatusNotFound)
		return
	}
	defer rc.Close()
	cropped, err := service.RenderAvatarCropWebP(r.Context(), rc, pos, 640)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to crop avatar: %s"}`, jsonEscape(err.Error())), http.StatusBadRequest)
		return
	}
	croppedKey := fmt.Sprintf("profiles/%s/%s/avatar/%s/crop.webp", workspaceID, profile.ProfileID, uuid.New())
	if err := h.store.Put(r.Context(), croppedKey, bytes.NewReader(cropped), int64(len(cropped)), "image/webp"); err != nil {
		http.Error(w, `{"error":"failed to store avatar crop"}`, http.StatusInternalServerError)
		return
	}
	encoded, _ := json.Marshal(service.AvatarCropPosition{
		X:      pos.X,
		Y:      pos.Y,
		Zoom:   pos.Zoom,
		Aspect: 1,
	})
	profile.AvatarCroppedURL = croppedKey
	profile.AvatarPosition = encoded
	saved, err := h.profiles.Upsert(r.Context(), profile)
	if err != nil {
		http.Error(w, `{"error":"failed to save avatar crop"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"profile": saved})
}

func (h *PhotographerProfileHandler) AvatarPreview(w http.ResponseWriter, r *http.Request) {
	userID, workspaceID, ok := currentProfileActor(w, r)
	if !ok {
		return
	}
	profile, err := h.profiles.GetByOwner(r.Context(), userID, workspaceID)
	if err != nil || profile.AvatarCroppedURL == "" {
		http.Error(w, `{"error":"avatar preview not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"avatar_cropped_url": profile.AvatarCroppedURL})
}

func (h *PhotographerProfileHandler) ListSelectableGalleries(w http.ResponseWriter, r *http.Request) {
	_, workspaceID, ok := currentProfileActor(w, r)
	if !ok {
		return
	}
	galleries, err := h.galleries.List(r.Context(), repository.GalleryFilter{
		WorkspaceID: workspaceID,
		Limit:       100,
	})
	if err != nil {
		http.Error(w, `{"error":"failed to list galleries"}`, http.StatusInternalServerError)
		return
	}
	out := make([]repository.ProfileGallery, 0, len(galleries))
	for _, g := range galleries {
		out = append(out, repository.ProfileGallery{
			ID:              g.ID,
			Title:           g.Title,
			Slug:            g.Slug,
			Description:     g.Description,
			GalleryType:     g.GalleryType,
			IsPublished:     g.IsPublished,
			Status:          g.Status,
			CoverThumbnails: g.CoverThumbnails,
		})
	}
	respondJSON(w, http.StatusOK, map[string]any{"galleries": out})
}

func (h *PhotographerProfileHandler) AddFeaturedGallery(w http.ResponseWriter, r *http.Request) {
	userID, workspaceID, ok := currentProfileActor(w, r)
	if !ok {
		return
	}
	var req struct {
		GalleryID string `json:"gallery_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	galleryID, err := uuid.Parse(req.GalleryID)
	if err != nil {
		http.Error(w, `{"error":"invalid gallery_id"}`, http.StatusBadRequest)
		return
	}
	profile, err := h.profiles.GetByOwner(r.Context(), userID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"profile not found"}`, http.StatusNotFound)
		return
	}
	if _, _, ok := h.requireGalleryInWorkspace(w, r, galleryID, workspaceID); !ok {
		return
	}
	if !containsUUID(profile.FeaturedGalleries, galleryID) {
		profile.FeaturedGalleries = append(profile.FeaturedGalleries, galleryID)
	}
	saved, err := h.profiles.Upsert(r.Context(), profile)
	if err != nil {
		http.Error(w, `{"error":"failed to update featured galleries"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"profile": saved})
}

func (h *PhotographerProfileHandler) RemoveFeaturedGallery(w http.ResponseWriter, r *http.Request) {
	userID, workspaceID, ok := currentProfileActor(w, r)
	if !ok {
		return
	}
	galleryID, err := uuid.Parse(chi.URLParam(r, "gallery_id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery_id"}`, http.StatusBadRequest)
		return
	}
	profile, err := h.profiles.GetByOwner(r.Context(), userID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"profile not found"}`, http.StatusNotFound)
		return
	}
	next := profile.FeaturedGalleries[:0]
	for _, id := range profile.FeaturedGalleries {
		if id != galleryID {
			next = append(next, id)
		}
	}
	profile.FeaturedGalleries = next
	if profile.IsPublic {
		issues, err := h.publicProfileRequirements(r.Context(), profile)
		if err != nil {
			http.Error(w, `{"error":"failed to validate public profile"}`, http.StatusInternalServerError)
			return
		}
		if len(issues) > 0 {
			http.Error(w, fmt.Sprintf(`{"error":"public profile is incomplete","missing":%s}`, mustJSON(issues)), http.StatusBadRequest)
			return
		}
	}
	saved, err := h.profiles.Upsert(r.Context(), profile)
	if err != nil {
		http.Error(w, `{"error":"failed to update featured galleries"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"profile": saved})
}

func (h *PhotographerProfileHandler) UpdateCategoryGalleries(w http.ResponseWriter, r *http.Request) {
	// Kept as an explicit endpoint from the spec. The current settings UI uses
	// featured_galleries; category support can round-trip arbitrary JSON safely.
	h.updateRawProfileJSON(w, r, "category_galleries")
}

func (h *PhotographerProfileHandler) UpdateVisibility(w http.ResponseWriter, r *http.Request) {
	h.updateRawProfileJSON(w, r, "visibility_config")
}

func (h *PhotographerProfileHandler) UpdateTheme(w http.ResponseWriter, r *http.Request) {
	userID, workspaceID, ok := currentProfileActor(w, r)
	if !ok {
		return
	}
	var req struct {
		SelectedTheme string `json:"selected_theme"`
		BrandColor    string `json:"brand_color"`
		LayoutStyle   string `json:"layout_style"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	profile, err := h.profiles.GetByOwner(r.Context(), userID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"profile not found"}`, http.StatusNotFound)
		return
	}
	if req.SelectedTheme != "" {
		profile.SelectedTheme = req.SelectedTheme
	}
	if req.BrandColor != "" {
		profile.BrandColor = req.BrandColor
	}
	if req.LayoutStyle != "" {
		profile.LayoutStyle = req.LayoutStyle
	}
	saved, err := h.profiles.Upsert(r.Context(), profile)
	if err != nil {
		http.Error(w, `{"error":"failed to update theme"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"profile": saved})
}

func (h *PhotographerProfileHandler) UpdateSEO(w http.ResponseWriter, r *http.Request) {
	userID, workspaceID, ok := currentProfileActor(w, r)
	if !ok {
		return
	}
	var req struct {
		MetaTitle       string   `json:"meta_title"`
		MetaDescription string   `json:"meta_description"`
		MetaKeywords    []string `json:"meta_keywords"`
		OGImageURL      string   `json:"og_image_url"`
		URLSlug         string   `json:"url_slug"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	profile, err := h.profiles.GetByOwner(r.Context(), userID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"profile not found"}`, http.StatusNotFound)
		return
	}
	profile.MetaTitle = req.MetaTitle
	profile.MetaDescription = req.MetaDescription
	profile.MetaKeywords = req.MetaKeywords
	profile.OGImageURL = req.OGImageURL
	if req.URLSlug != "" {
		slug, err := h.uniqueSlug(r.Context(), profile.ProfileID, req.URLSlug)
		if err != nil {
			http.Error(w, `{"error":"url_slug is unavailable"}`, http.StatusConflict)
			return
		}
		profile.URLSlug = slug
	}
	saved, err := h.profiles.Upsert(r.Context(), profile)
	if err != nil {
		http.Error(w, `{"error":"failed to update seo"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"profile":    saved,
		"public_url": h.profileURL(r, saved),
	})
}

func (h *PhotographerProfileHandler) GetQR(w http.ResponseWriter, r *http.Request) {
	userID, workspaceID, ok := currentProfileActor(w, r)
	if !ok {
		return
	}
	profile, err := h.profiles.GetByOwner(r.Context(), userID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"profile not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"url": h.profileURL(r, profile)})
}

func (h *PhotographerProfileHandler) GetVCard(w http.ResponseWriter, r *http.Request) {
	userID, workspaceID, ok := currentProfileActor(w, r)
	if !ok {
		return
	}
	profile, err := h.profiles.GetByOwner(r.Context(), userID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"profile not found"}`, http.StatusNotFound)
		return
	}
	filename := "rawdrive-profile.vcf"
	if profile.URLSlug != "" {
		filename = profile.URLSlug + ".vcf"
	}
	w.Header().Set("Content-Type", "text/vcard; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	_, _ = w.Write([]byte(buildVCard(profile, h.profileURL(r, profile))))
}

func (h *PhotographerProfileHandler) GetPublic(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	profile, err := h.profiles.GetPublishedBySlug(r.Context(), slug)
	if err != nil {
		http.Error(w, `{"error":"profile not found"}`, http.StatusNotFound)
		return
	}
	visibility := readProfileVisibility(profile.VisibilityConfig)
	publicProfile := sanitizePublicProfile(profile, visibility)
	if publicProfile.AvatarCroppedURL != "" {
		publicProfile.AvatarCroppedURL = h.presignOrBlank(r, publicProfile.AvatarCroppedURL)
	}
	if publicProfile.AvatarURL != "" {
		publicProfile.AvatarURL = h.presignOrBlank(r, publicProfile.AvatarURL)
	}
	if publicProfile.CoverURL != "" {
		publicProfile.CoverURL = h.presignOrBlank(r, publicProfile.CoverURL)
	}
	if publicProfile.OGImageURL != "" {
		publicProfile.OGImageURL = h.presignOrBlank(r, publicProfile.OGImageURL)
	}

	galleries := []repository.ProfileGallery{}
	if visibility.ShowGalleries {
		galleries, err = h.profiles.ListFeaturedGalleries(r.Context(), profile.WorkspaceID, profile.FeaturedGalleries)
		if err != nil {
			http.Error(w, `{"error":"failed to load featured galleries"}`, http.StatusInternalServerError)
			return
		}
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"profile":    publicProfile,
		"galleries":  galleries,
		"public_url": h.profileURL(r, profile),
	})
}

func (h *PhotographerProfileHandler) TrackPublicView(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	profile, err := h.profiles.GetPublishedBySlug(r.Context(), slug)
	if err != nil {
		http.Error(w, `{"error":"profile not found"}`, http.StatusNotFound)
		return
	}
	source := r.URL.Query().Get("source")
	if source == "" {
		source = r.Referer()
	}
	if err := h.profiles.RecordView(r.Context(), profile.ProfileID, visitorHash(r), source, r.UserAgent()); err != nil {
		http.Error(w, `{"error":"failed to track view"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *PhotographerProfileHandler) updateRawProfileJSON(w http.ResponseWriter, r *http.Request, field string) {
	userID, workspaceID, ok := currentProfileActor(w, r)
	if !ok {
		return
	}
	var raw json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil || !json.Valid(raw) {
		http.Error(w, `{"error":"invalid json body"}`, http.StatusBadRequest)
		return
	}
	profile, err := h.profiles.GetByOwner(r.Context(), userID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"profile not found"}`, http.StatusNotFound)
		return
	}
	switch field {
	case "visibility_config":
		profile.VisibilityConfig = raw
		if profile.IsPublic {
			issues, err := h.publicProfileRequirements(r.Context(), profile)
			if err != nil {
				http.Error(w, `{"error":"failed to validate public profile"}`, http.StatusInternalServerError)
				return
			}
			if len(issues) > 0 {
				http.Error(w, fmt.Sprintf(`{"error":"public profile is incomplete","missing":%s}`, mustJSON(issues)), http.StatusBadRequest)
				return
			}
		}
	case "category_galleries":
		saved, err := h.profiles.UpdateCategoryGalleries(r.Context(), profile.ProfileID, raw)
		if err != nil {
			http.Error(w, `{"error":"failed to update category galleries"}`, http.StatusInternalServerError)
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"profile": saved})
		return
	default:
		http.Error(w, `{"error":"unsupported field"}`, http.StatusBadRequest)
		return
	}
	saved, err := h.profiles.Upsert(r.Context(), profile)
	if err != nil {
		http.Error(w, `{"error":"failed to update profile"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"profile": saved})
}

func (h *PhotographerProfileHandler) requireGalleryInWorkspace(w http.ResponseWriter, r *http.Request, galleryID, workspaceID uuid.UUID) (*repository.Gallery, uuid.UUID, bool) {
	gallery, err := h.galleries.GetByID(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return nil, uuid.Nil, false
	}
	if gallery.WorkspaceID != workspaceID {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return nil, uuid.Nil, false
	}
	return gallery, workspaceID, true
}

func currentProfileActor(w http.ResponseWriter, r *http.Request) (uuid.UUID, uuid.UUID, bool) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return uuid.Nil, uuid.Nil, false
	}
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return uuid.Nil, uuid.Nil, false
	}
	return userID, workspaceID, true
}

func (h *PhotographerProfileHandler) uniqueSlug(ctx context.Context, profileID uuid.UUID, value string) (string, error) {
	base := slugifyProfile(value)
	if base == "" {
		return "", errors.New("empty slug")
	}
	if profileSlugReserved(base) {
		base += "-profile"
	}
	for i := 0; i < 20; i++ {
		candidate := base
		if i > 0 {
			candidate = fmt.Sprintf("%s-%d", base, i+1)
		}
		owner, err := h.profiles.SlugOwner(ctx, candidate)
		if errors.Is(err, repository.ErrPhotographerProfileNotFound) || owner == profileID {
			return candidate, nil
		}
		if err != nil {
			return "", err
		}
	}
	return "", errors.New("slug unavailable")
}

func (h *PhotographerProfileHandler) publicProfileRequirements(ctx context.Context, p *repository.PhotographerProfile) ([]string, error) {
	if p == nil {
		return []string{"profile"}, nil
	}
	visibility := readProfileVisibility(p.VisibilityConfig)
	missing := []string{}
	if strings.TrimSpace(p.LastName) == "" {
		missing = append(missing, "last_name")
	}
	if strings.TrimSpace(p.URLSlug) == "" {
		missing = append(missing, "url_slug")
	}
	if strings.TrimSpace(p.AvatarCroppedURL) == "" && strings.TrimSpace(p.AvatarURL) == "" {
		missing = append(missing, "profile_photo")
	}
	if !profileHasVisibleContact(p, visibility) {
		missing = append(missing, "visible_contact_method")
	}
	galleries, err := h.profiles.ListFeaturedGalleries(ctx, p.WorkspaceID, p.FeaturedGalleries)
	if err != nil {
		return nil, err
	}
	if len(galleries) == 0 {
		missing = append(missing, "featured_gallery")
	}
	return missing, nil
}

func profileHasVisibleContact(p *repository.PhotographerProfile, visibility profileVisibility) bool {
	return (visibility.ShowEmail && strings.TrimSpace(p.PrimaryEmail) != "") ||
		(visibility.ShowPhone && strings.TrimSpace(p.PrimaryPhone) != "") ||
		(visibility.ShowWhatsapp && strings.TrimSpace(p.WhatsappNumber) != "")
}

var profileSlugCharRe = regexp.MustCompile(`[^a-z0-9-]+`)
var profileSlugDashRe = regexp.MustCompile(`-+`)

var profileReservedSlugs = map[string]struct{}{
	"avatar":     {},
	"galleries":  {},
	"publish":    {},
	"qr":         {},
	"seo":        {},
	"theme":      {},
	"unpublish":  {},
	"vcard":      {},
	"visibility": {},
}

func profileSlugReserved(slug string) bool {
	_, ok := profileReservedSlugs[slug]
	return ok
}

func slugifyProfile(value string) string {
	slug := strings.ToLower(strings.TrimSpace(value))
	slug = strings.ReplaceAll(slug, "&", " and ")
	slug = profileSlugCharRe.ReplaceAllString(slug, "-")
	slug = profileSlugDashRe.ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if len(slug) > 90 {
		slug = strings.Trim(slug[:90], "-")
	}
	return slug
}

func profileImageExt(filename, contentType string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp":
		return ext
	}
	if exts, err := mime.ExtensionsByType(contentType); err == nil {
		for _, candidate := range exts {
			switch candidate {
			case ".jpg", ".jpeg", ".png", ".webp":
				return candidate
			}
		}
	}
	return ".jpg"
}

func containsUUID(ids []uuid.UUID, id uuid.UUID) bool {
	for _, existing := range ids {
		if existing == id {
			return true
		}
	}
	return false
}

func defaultProfileDescription(p *repository.PhotographerProfile) string {
	parts := []string{p.DisplayName}
	if p.ProfessionalTitle != "" {
		parts = append(parts, p.ProfessionalTitle)
	}
	if p.PrimaryCity != "" {
		parts = append(parts, p.PrimaryCity)
	}
	out := strings.Join(parts, " - ")
	if p.Tagline != "" {
		out = out + ". " + p.Tagline
	}
	if len(out) > 155 {
		out = out[:155]
	}
	return out
}

func (h *PhotographerProfileHandler) profileURL(r *http.Request, p *repository.PhotographerProfile) string {
	if p == nil || p.URLSlug == "" {
		return ""
	}
	base := h.publicBaseURL
	if base == "" && r != nil {
		scheme := r.Header.Get("X-Forwarded-Proto")
		if scheme == "" {
			scheme = "http"
			if r.TLS != nil {
				scheme = "https"
			}
		}
		host := r.Header.Get("X-Forwarded-Host")
		if host == "" {
			host = r.Host
		}
		base = scheme + "://" + host
	}
	if base == "" {
		return "/p/" + p.URLSlug
	}
	return strings.TrimRight(base, "/") + "/p/" + p.URLSlug
}

func (h *PhotographerProfileHandler) presignOrBlank(r *http.Request, key string) string {
	if key == "" || strings.HasPrefix(key, "http://") || strings.HasPrefix(key, "https://") {
		return key
	}
	if h.store == nil {
		return ""
	}
	url, err := h.store.PresignURL(r.Context(), key, storage.PresignOptions{ExpiresInSeconds: 3600})
	if err != nil {
		return ""
	}
	return url
}

type profileVisibility struct {
	ShowProfilePhoto bool `json:"show_profile_photo"`
	ShowName         bool `json:"show_name"`
	ShowTagline      bool `json:"show_tagline"`
	ShowLocation     bool `json:"show_location"`
	ShowBio          bool `json:"show_bio"`
	ShowGalleries    bool `json:"show_galleries"`
	ShowReviews      bool `json:"show_reviews"`
	ShowPricing      bool `json:"show_pricing"`
	ShowEmail        bool `json:"show_email"`
	ShowPhone        bool `json:"show_phone"`
	ShowWhatsapp     bool `json:"show_whatsapp"`
	ShowSocials      bool `json:"show_socials"`
	ShowAwards       bool `json:"show_awards"`
	ShowServices     bool `json:"show_services"`
	ShowEquipment    bool `json:"show_equipment"`
	ShowCustomLinks  bool `json:"show_custom_links"`
}

func readProfileVisibility(raw json.RawMessage) profileVisibility {
	visibility := profileVisibility{
		ShowProfilePhoto: true,
		ShowName:         true,
		ShowTagline:      true,
		ShowLocation:     true,
		ShowBio:          true,
		ShowGalleries:    true,
		ShowReviews:      true,
		ShowEmail:        true,
		ShowWhatsapp:     true,
		ShowSocials:      true,
		ShowAwards:       true,
		ShowServices:     true,
		ShowCustomLinks:  true,
	}
	_ = json.Unmarshal(raw, &visibility)
	return visibility
}

func sanitizePublicProfile(p *repository.PhotographerProfile, visibility profileVisibility) *repository.PhotographerProfile {
	out := *p
	if !visibility.ShowProfilePhoto {
		out.AvatarURL = ""
		out.AvatarCroppedURL = ""
	}
	if !visibility.ShowName {
		out.FirstName = ""
		out.LastName = ""
		out.DisplayName = out.BusinessName
		out.ProfessionalTitle = ""
	}
	if !visibility.ShowTagline {
		out.Tagline = ""
	}
	if !visibility.ShowBio {
		out.ShortBio = ""
		out.LongBio = ""
	}
	if !visibility.ShowEmail {
		out.PrimaryEmail = ""
		out.SecondaryEmail = ""
	}
	if !visibility.ShowPhone {
		out.PrimaryPhone = ""
	}
	if !visibility.ShowWhatsapp {
		out.WhatsappNumber = ""
	}
	if !visibility.ShowPricing {
		out.StartingPrice = nil
		out.PriceRangeMax = nil
		out.PaymentTerms = ""
		out.DepositAmount = nil
		out.Packages = json.RawMessage(`[]`)
	}
	if !visibility.ShowLocation {
		out.PrimaryCity = ""
		out.State = ""
		out.Country = ""
		out.ServiceRadiusKM = nil
		out.CoveredCities = []string{}
	}
	if !visibility.ShowEquipment {
		out.Equipment = json.RawMessage(`{}`)
	}
	if !visibility.ShowServices {
		out.PhotographyStyles = []string{}
		out.Specializations = []string{}
		out.LanguagesSpoken = []string{}
		out.TravelAvailability = ""
	}
	if !visibility.ShowReviews {
		out.Testimonials = json.RawMessage(`[]`)
		out.VideoTestimonials = []string{}
		out.AverageRating = nil
	}
	if !visibility.ShowSocials {
		out.SocialInstagram = ""
		out.SocialFacebook = ""
		out.SocialLinkedin = ""
		out.SocialYoutube = ""
		out.SocialPinterest = ""
	}
	if !visibility.ShowCustomLinks {
		out.CustomLinks = json.RawMessage(`[]`)
	}
	if !visibility.ShowAwards {
		out.Awards = json.RawMessage(`[]`)
		out.Certifications = json.RawMessage(`[]`)
		out.FeaturedIn = []string{}
	}
	out.GSTNumber = ""
	out.PaymentMethods = []string{}
	return &out
}

func visitorHash(r *http.Request) string {
	ip := r.Header.Get("X-Forwarded-For")
	if ip != "" {
		ip = strings.TrimSpace(strings.Split(ip, ",")[0])
	} else {
		ip = r.RemoteAddr
	}
	sum := sha256.Sum256([]byte(ip + "|" + r.UserAgent()))
	return hex.EncodeToString(sum[:])
}

func buildVCard(p *repository.PhotographerProfile, url string) string {
	lines := []string{
		"BEGIN:VCARD",
		"VERSION:3.0",
		"N:" + vcardEscape(p.LastName) + ";" + vcardEscape(p.FirstName) + ";;;",
		"FN:" + vcardEscape(firstNonEmptyProfileValue(p.DisplayName, p.BusinessName, "RawDrive Photographer")),
	}
	if p.BusinessName != "" {
		lines = append(lines, "ORG:"+vcardEscape(p.BusinessName))
	}
	if p.ProfessionalTitle != "" {
		lines = append(lines, "TITLE:"+vcardEscape(p.ProfessionalTitle))
	}
	if p.PrimaryEmail != "" {
		lines = append(lines, "EMAIL;TYPE=INTERNET:"+vcardEscape(p.PrimaryEmail))
	}
	if p.PrimaryPhone != "" {
		lines = append(lines, "TEL;TYPE=CELL:"+vcardEscape(p.PrimaryPhone))
	}
	if p.WhatsappNumber != "" && p.WhatsappNumber != p.PrimaryPhone {
		lines = append(lines, "TEL;TYPE=VOICE:"+vcardEscape(p.WhatsappNumber))
	}
	address := strings.Join(nonEmpty(p.BusinessAddress, p.PrimaryCity, p.State, p.Country), ", ")
	if address != "" {
		lines = append(lines, "ADR;TYPE=WORK:;;"+vcardEscape(address)+";;;;")
	}
	if url != "" {
		lines = append(lines, "URL:"+vcardEscape(url))
	}
	lines = append(lines, "END:VCARD")
	return strings.Join(lines, "\r\n") + "\r\n"
}

func vcardEscape(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, "\n", `\n`)
	value = strings.ReplaceAll(value, ",", `\,`)
	value = strings.ReplaceAll(value, ";", `\;`)
	return value
}

func firstNonEmptyProfileValue(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func nonEmpty(values ...string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			out = append(out, strings.TrimSpace(value))
		}
	}
	return out
}

func jsonEscape(value string) string {
	encoded, _ := json.Marshal(value)
	return strings.Trim(string(encoded), `"`)
}

func mustJSON(value any) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}
