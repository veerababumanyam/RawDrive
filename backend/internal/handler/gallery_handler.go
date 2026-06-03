package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/ai"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// GalleryHandler handles gallery HTTP requests.
type GalleryHandler struct {
	gallerySvc *service.GalleryService

	// M21: optional AI face scan dependencies (nil-safe — handlers degrade
	// gracefully so existing callers that construct GalleryHandler without
	// these continue to compile).
	faceSvc  *ai.FaceService
	assetSvc *service.AssetService
	jobRepo  *ai.JobRepo
	pool     *pgxpool.Pool

	// assetBatch is the bulk asset-read seam for ?include_assets=true (PERF-23).
	// Optional: when nil, enrichGalleryAssets falls back to the pool, and when
	// neither is wired it degrades to nil-embedded rows. Tests inject a counting
	// fake via WithAssetBatchSource — the same seam the public path uses (F-029).
	assetBatch publicAssetBatchSource
}

// NewGalleryHandler creates a new GalleryHandler.
func NewGalleryHandler(svc *service.GalleryService) *GalleryHandler {
	return &GalleryHandler{gallerySvc: svc}
}

// WithAIDeps injects face scan dependencies for the M21 gallery-scoped
// face detection endpoints. Call after construction when wiring routes_m2.
// Returns the receiver so callers can chain.
func (h *GalleryHandler) WithAIDeps(faceSvc *ai.FaceService, assetSvc *service.AssetService, jobRepo *ai.JobRepo) *GalleryHandler {
	h.faceSvc = faceSvc
	h.assetSvc = assetSvc
	h.jobRepo = jobRepo
	return h
}

// WithPool injects DB access for workspace relationship validation and
// summary hydration. Gallery CRUD still goes through GalleryService.
func (h *GalleryHandler) WithPool(pool *pgxpool.Pool) *GalleryHandler {
	h.pool = pool
	return h
}

// WithAssetBatchSource overrides the bulk asset lookup used by
// ?include_assets=true. Production wires the pool-backed poolAssetBatchSource
// (via WithPool); tests inject an in-memory counting fake. Mirrors the public
// handler's seam so both list paths share one N+1-free contract. Chainable.
func (h *GalleryHandler) WithAssetBatchSource(src publicAssetBatchSource) *GalleryHandler {
	h.assetBatch = src
	return h
}

// galleryAssetWithAsset is a gallery-asset junction row with its asset record
// embedded inline, returned when ?include_assets=true so the dashboard hydrates
// a whole page from one response instead of looping getAsset() per asset
// (PERF-23). The embedded GalleryAsset keeps the same JSON shape the un-enriched
// path returns, plus an "asset" field (null when the asset is unavailable).
type galleryAssetWithAsset struct {
	repository.GalleryAsset
	Asset *repository.Asset `json:"asset"`
}

// embedGalleryAssets attaches each asset to its junction row, preserving the
// gallery's sort order (it iterates the ordered junction slice and looks each
// asset up by id). Assets absent from `assets` embed as nil.
func embedGalleryAssets(junctions []repository.GalleryAsset, assets []*repository.Asset) []galleryAssetWithAsset {
	byID := make(map[uuid.UUID]*repository.Asset, len(assets))
	for _, a := range assets {
		byID[a.ID] = a
	}
	out := make([]galleryAssetWithAsset, 0, len(junctions))
	for _, j := range junctions {
		out = append(out, galleryAssetWithAsset{GalleryAsset: j, Asset: byID[j.AssetID]})
	}
	return out
}

// enrichGalleryAssets hydrates junction rows with their assets in a single bulk
// query (PERF-23). It prefers the injected batch source, falls back to the
// request pool, and degrades to nil-embedded rows when neither is wired (the
// client then falls back to its own hydration).
func (h *GalleryHandler) enrichGalleryAssets(ctx context.Context, junctions []repository.GalleryAsset) ([]galleryAssetWithAsset, error) {
	batch := h.assetBatch
	if batch == nil && h.pool != nil {
		batch = poolAssetBatchSource{pool: h.pool}
	}
	if batch == nil {
		return embedGalleryAssets(junctions, nil), nil
	}

	ids := make([]uuid.UUID, 0, len(junctions))
	for _, j := range junctions {
		ids = append(ids, j.AssetID)
	}
	assets, err := batch.GetByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	return embedGalleryAssets(junctions, assets), nil
}

var galleryRelationshipEntityTables = map[string]string{
	"contact_id":         "contacts",
	"primary_contact_id": "contacts",
	"project_id":         "studio_projects",
	"event_id":           "events",
	"deal_id":            "deals",
	"invoice_id":         "invoices",
}

func parseOptionalUUIDString(value, field string) (*uuid.UUID, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	id, err := uuid.Parse(value)
	if err != nil {
		return nil, fmt.Errorf("invalid %s", field)
	}
	return &id, nil
}

func parseOptionalUUIDRaw(raw map[string]json.RawMessage, field string) (bool, *uuid.UUID, error) {
	value, ok := raw[field]
	if !ok {
		return false, nil, nil
	}
	trimmed := strings.TrimSpace(string(value))
	if trimmed == "" || trimmed == "null" || trimmed == `""` {
		return true, nil, nil
	}
	var text string
	if err := json.Unmarshal(value, &text); err != nil {
		return true, nil, fmt.Errorf("invalid %s", field)
	}
	id, err := uuid.Parse(text)
	if err != nil {
		return true, nil, fmt.Errorf("invalid %s", field)
	}
	return true, &id, nil
}

func normalizeGalleryDownloadQuality(value string) (string, error) {
	downloadQuality := strings.ToLower(strings.TrimSpace(value))
	if downloadQuality != "webp" && downloadQuality != "thumbnail" && downloadQuality != "original" {
		return "", fmt.Errorf("download_quality must be webp, thumbnail, or original")
	}
	return downloadQuality, nil
}

func (h *GalleryHandler) validateLinkedEntity(ctx context.Context, workspaceID uuid.UUID, field string, id *uuid.UUID) error {
	if h.pool == nil || id == nil {
		return nil
	}
	table, ok := galleryRelationshipEntityTables[field]
	if !ok {
		return fmt.Errorf("unsupported relationship field %s", field)
	}
	var exists bool
	query := fmt.Sprintf(`SELECT EXISTS(SELECT 1 FROM %s WHERE id = $1 AND workspace_id = $2)`, table)
	if err := h.pool.QueryRow(ctx, query, *id, workspaceID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("%s not found in workspace", field)
	}
	return nil
}

func (h *GalleryHandler) requireGalleryInWorkspace(w http.ResponseWriter, r *http.Request, galleryID uuid.UUID) (*repository.Gallery, uuid.UUID, bool) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return nil, uuid.Nil, false
	}
	gallery, err := h.gallerySvc.GetByID(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return nil, uuid.Nil, false
	}
	if gallery == nil || gallery.WorkspaceID != workspaceID {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return nil, uuid.Nil, false
	}
	return gallery, workspaceID, true
}

// Create handles POST /api/v1/galleries
func (h *GalleryHandler) Create(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	userID, ok := getUserID(r)
	if !ok || userID == uuid.Nil {
		log.Printf("gallery create rejected: missing valid user claim workspace_id=%s", workspaceID)
		http.Error(w, `{"error":"missing user_id"}`, http.StatusUnauthorized)
		return
	}

	var input struct {
		Title            string  `json:"title"`
		Description      string  `json:"description"`
		GalleryType      string  `json:"gallery_type"`
		ContactID        string  `json:"contact_id"`
		PrimaryContactID string  `json:"primary_contact_id"`
		ProjectID        string  `json:"project_id"`
		EventID          string  `json:"event_id"`
		DealID           string  `json:"deal_id"`
		InvoiceID        string  `json:"invoice_id"`
		TetheringEnabled bool    `json:"tethering_enabled"`
		TetherDirectory  *string `json:"tether_directory"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	if input.Title == "" {
		http.Error(w, `{"error":"title required"}`, http.StatusBadRequest)
		return
	}
	if input.GalleryType == "" {
		input.GalleryType = "proofing"
	}
	if input.PrimaryContactID != "" && input.ContactID != "" && input.PrimaryContactID != input.ContactID {
		http.Error(w, `{"error":"primary_contact_id and contact_id must match"}`, http.StatusBadRequest)
		return
	}
	contactValue := input.PrimaryContactID
	if contactValue == "" {
		contactValue = input.ContactID
	}
	primaryContactID, err := parseOptionalUUIDString(contactValue, "primary_contact_id")
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}
	projectID, err := parseOptionalUUIDString(input.ProjectID, "project_id")
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}
	eventID, err := parseOptionalUUIDString(input.EventID, "event_id")
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}
	dealID, err := parseOptionalUUIDString(input.DealID, "deal_id")
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}
	invoiceID, err := parseOptionalUUIDString(input.InvoiceID, "invoice_id")
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}
	for field, id := range map[string]*uuid.UUID{
		"primary_contact_id": primaryContactID,
		"project_id":         projectID,
		"event_id":           eventID,
		"deal_id":            dealID,
		"invoice_id":         invoiceID,
	} {
		if err := h.validateLinkedEntity(r.Context(), workspaceID, field, id); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
			return
		}
	}

	gallery, err := h.gallerySvc.Create(r.Context(), service.CreateGalleryInput{
		WorkspaceID:      workspaceID,
		Title:            input.Title,
		Description:      input.Description,
		GalleryType:      input.GalleryType,
		CreatedBy:        userID,
		ContactID:        primaryContactID,
		PrimaryContactID: primaryContactID,
		ProjectID:        projectID,
		EventID:          eventID,
		DealID:           dealID,
		InvoiceID:        invoiceID,
		TetheringEnabled: input.TetheringEnabled,
		TetherDirectory:  input.TetherDirectory,
	})
	if err != nil {
		log.Printf("gallery create failed: workspace_id=%s user_id=%s err=%v", workspaceID, userID, err)
		http.Error(w, `{"error":"create failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusCreated, gallery)
}

// List handles GET /api/v1/galleries
func (h *GalleryHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}

	galleries, err := h.gallerySvc.List(r.Context(), repository.GalleryFilter{
		WorkspaceID: workspaceID,
		Status:      r.URL.Query().Get("status"),
		GalleryType: r.URL.Query().Get("type"),
		Search:      r.URL.Query().Get("search"),
		Limit:       50,
	})
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, galleries)
}

// GetByID handles GET /api/v1/galleries/{id}
func (h *GalleryHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	gallery, _, ok := h.requireGalleryInWorkspace(w, r, id)
	if !ok {
		return
	}

	respondJSON(w, http.StatusOK, gallery)
}

// Update handles PUT /api/v1/galleries/{id}
func (h *GalleryHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	gallery, workspaceID, ok := h.requireGalleryInWorkspace(w, r, id)
	if !ok {
		return
	}

	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	if value, ok := raw["title"]; ok {
		if err := json.Unmarshal(value, &gallery.Title); err != nil {
			http.Error(w, `{"error":"invalid title"}`, http.StatusBadRequest)
			return
		}
	}
	if value, ok := raw["description"]; ok {
		if err := json.Unmarshal(value, &gallery.Description); err != nil {
			http.Error(w, `{"error":"invalid description"}`, http.StatusBadRequest)
			return
		}
	}
	if value, ok := raw["status"]; ok {
		if err := json.Unmarshal(value, &gallery.Status); err != nil {
			http.Error(w, `{"error":"invalid status"}`, http.StatusBadRequest)
			return
		}
	}
	if value, ok := raw["is_published"]; ok {
		if err := json.Unmarshal(value, &gallery.IsPublished); err != nil {
			http.Error(w, `{"error":"invalid is_published"}`, http.StatusBadRequest)
			return
		}
	}
	if value, ok := raw["download_enabled"]; ok {
		if err := json.Unmarshal(value, &gallery.DownloadEnabled); err != nil {
			http.Error(w, `{"error":"invalid download_enabled"}`, http.StatusBadRequest)
			return
		}
	}
	if value, ok := raw["download_quality"]; ok {
		var downloadQuality string
		if err := json.Unmarshal(value, &downloadQuality); err != nil {
			http.Error(w, `{"error":"invalid download_quality"}`, http.StatusBadRequest)
			return
		}
		downloadQuality, err = normalizeGalleryDownloadQuality(downloadQuality)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
			return
		}
		gallery.DownloadQuality = downloadQuality
	}
	if value, ok := raw["sort_preference"]; ok {
		if err := json.Unmarshal(value, &gallery.SortPreference); err != nil {
			http.Error(w, `{"error":"invalid sort_preference"}`, http.StatusBadRequest)
			return
		}
	}
	if value, ok := raw["max_selections"]; ok {
		if err := json.Unmarshal(value, &gallery.MaxSelections); err != nil {
			http.Error(w, `{"error":"invalid max_selections"}`, http.StatusBadRequest)
			return
		}
	}
	if value, ok := raw["expires_at"]; ok {
		if err := json.Unmarshal(value, &gallery.ExpiresAt); err != nil {
			http.Error(w, `{"error":"invalid expires_at"}`, http.StatusBadRequest)
			return
		}
	}
	if value, ok := raw["whatsapp_template"]; ok {
		if err := json.Unmarshal(value, &gallery.WhatsappTemplate); err != nil {
			http.Error(w, `{"error":"invalid whatsapp_template"}`, http.StatusBadRequest)
			return
		}
	}
	// 2026-05-18: same bug class as watermark_config below — the gallery
	// Settings UI's "FaceID entry" + "Face detection" toggles wrote here
	// for years and silently no-op'd because the handler ignored both
	// keys. Now decoded directly. Both columns are top-level booleans
	// (migrations 041 + 046) — DO NOT nest under settings JSONB even
	// though the original frontend code did.
	if value, ok := raw["faceid_enabled"]; ok {
		if err := json.Unmarshal(value, &gallery.FaceIDEnabled); err != nil {
			http.Error(w, `{"error":"invalid faceid_enabled"}`, http.StatusBadRequest)
			return
		}
	}
	if value, ok := raw["face_detection_enabled"]; ok {
		if err := json.Unmarshal(value, &gallery.FaceDetectionEnabled); err != nil {
			http.Error(w, `{"error":"invalid face_detection_enabled"}`, http.StatusBadRequest)
			return
		}
	}
	// Gallery Enhancements June 2026: per-gallery branded-email automation toggle.
	if value, ok := raw["email_automation_enabled"]; ok {
		if err := json.Unmarshal(value, &gallery.EmailAutomationEnabled); err != nil {
			http.Error(w, `{"error":"invalid email_automation_enabled"}`, http.StatusBadRequest)
			return
		}
	}
	// 2026-05-18: watermark_config passthrough. The gallery settings UI
	// (frontend/src/app/(dashboard)/galleries/[id]/settings/page.tsx)
	// has had the toggle + text + opacity + position controls wired
	// since M19, but this handler's accepted-fields list never included
	// watermark_config — every toggle silently vanished server-side and
	// the UI reverted on the subsequent setGallery() with the unchanged
	// row. Now decoded directly into the generic map field so the
	// frontend can extend the schema (e.g. use_logo, font_family) without
	// any further Go change.
	if value, ok := raw["watermark_config"]; ok {
		if err := json.Unmarshal(value, &gallery.WatermarkConfig); err != nil {
			http.Error(w, `{"error":"invalid watermark_config"}`, http.StatusBadRequest)
			return
		}
	}
	for _, field := range []string{"primary_contact_id", "contact_id", "project_id", "event_id", "deal_id", "invoice_id"} {
		present, value, err := parseOptionalUUIDRaw(raw, field)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
			return
		}
		if !present {
			continue
		}
		validateField := field
		if field == "contact_id" {
			validateField = "primary_contact_id"
		}
		if err := h.validateLinkedEntity(r.Context(), workspaceID, validateField, value); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
			return
		}
		switch field {
		case "primary_contact_id", "contact_id":
			gallery.PrimaryContactID = value
			gallery.ContactID = value
		case "project_id":
			gallery.ProjectID = value
		case "event_id":
			gallery.EventID = value
		case "deal_id":
			gallery.DealID = value
		case "invoice_id":
			gallery.InvoiceID = value
		}
	}

	// music_asset_id (Gallery Enhancements June 2026): optional slideshow
	// background track. Parsed as an optional nullable UUID. Persisted via the
	// music-specific column write after Update so it does not collide with the
	// positional Update column set. Validation (workspace ownership + audio
	// content-type) lives in the service.
	musicPresent, musicAssetID, err := parseOptionalUUIDRaw(raw, "music_asset_id")
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}

	if musicPresent {
		if err := h.gallerySvc.ValidateGalleryMusic(r.Context(), workspaceID, musicAssetID); err != nil {
			if errors.Is(err, service.ErrMusicAssetNotFound) || errors.Is(err, service.ErrMusicAssetNotAudio) {
				http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
			return
		}
	}

	if err := h.gallerySvc.Update(r.Context(), gallery); err != nil {
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}

	if musicPresent {
		if err := h.gallerySvc.SetGalleryMusic(r.Context(), id, workspaceID, musicAssetID); err != nil {
			if errors.Is(err, service.ErrMusicAssetNotFound) || errors.Is(err, service.ErrMusicAssetNotAudio) {
				http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
				return
			}
			http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
			return
		}
		gallery.MusicAssetID = musicAssetID
	}

	respondJSON(w, http.StatusOK, gallery)
}

type galleryWorkspaceContact struct {
	ID    uuid.UUID `json:"id"`
	Name  string    `json:"name"`
	Email *string   `json:"email,omitempty"`
	Phone *string   `json:"phone,omitempty"`
}

type galleryWorkspaceSection struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Href  string `json:"href"`
}

// LinkRelationships handles PATCH /api/v1/galleries/{id}/client-link.
func (h *GalleryHandler) LinkRelationships(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	gallery, err := h.gallerySvc.GetByID(r.Context(), galleryID)
	if err != nil || gallery == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if gallery.WorkspaceID != workspaceID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	for _, field := range []string{"primary_contact_id", "contact_id", "project_id", "event_id", "deal_id", "invoice_id"} {
		present, value, err := parseOptionalUUIDRaw(raw, field)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
			return
		}
		if !present {
			continue
		}
		validateField := field
		if field == "contact_id" {
			validateField = "primary_contact_id"
		}
		if err := h.validateLinkedEntity(r.Context(), workspaceID, validateField, value); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
			return
		}
		switch field {
		case "primary_contact_id", "contact_id":
			gallery.PrimaryContactID = value
			gallery.ContactID = value
		case "project_id":
			gallery.ProjectID = value
		case "event_id":
			gallery.EventID = value
		case "deal_id":
			gallery.DealID = value
		case "invoice_id":
			gallery.InvoiceID = value
		}
	}

	if err := h.gallerySvc.Update(r.Context(), gallery); err != nil {
		http.Error(w, `{"error":"link update failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, gallery)
}

// WorkspaceSummary handles GET /api/v1/galleries/{id}/workspace-summary.
func (h *GalleryHandler) WorkspaceSummary(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	gallery, err := h.gallerySvc.GetByID(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if gallery == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if gallery.WorkspaceID != workspaceID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var contact *galleryWorkspaceContact
	if h.pool != nil && gallery.PrimaryContactID != nil {
		var c galleryWorkspaceContact
		err := h.pool.QueryRow(r.Context(),
			`SELECT id, name, email, phone FROM contacts WHERE id = $1 AND workspace_id = $2`,
			*gallery.PrimaryContactID, workspaceID,
		).Scan(&c.ID, &c.Name, &c.Email, &c.Phone)
		if err == nil {
			contact = &c
		} else if err != pgx.ErrNoRows {
			http.Error(w, `{"error":"summary failed"}`, http.StatusInternalServerError)
			return
		}
	}

	sections := []galleryWorkspaceSection{
		{Key: "overview", Label: "Overview", Href: fmt.Sprintf("/galleries/%s", gallery.ID)},
		{Key: "photos", Label: "Photos", Href: fmt.Sprintf("/galleries/%s#photos", gallery.ID)},
		{Key: "albums", Label: "Albums", Href: fmt.Sprintf("/galleries/%s#albums", gallery.ID)},
		{Key: "cover-design", Label: "Cover & Design", Href: fmt.Sprintf("/galleries/%s/cover", gallery.ID)},
		{Key: "share", Label: "Share", Href: fmt.Sprintf("/galleries/%s#share", gallery.ID)},
		{Key: "proofing", Label: "Proofing", Href: fmt.Sprintf("/galleries/%s/proofing", gallery.ID)},
		{Key: "delivery", Label: "Delivery", Href: fmt.Sprintf("/galleries/%s#delivery", gallery.ID)},
		{Key: "sales", Label: "Sales", Href: fmt.Sprintf("/galleries/%s#sales", gallery.ID)},
		{Key: "insights", Label: "Insights", Href: fmt.Sprintf("/galleries/%s/analytics", gallery.ID)},
		{Key: "ai", Label: "AI", Href: fmt.Sprintf("/galleries/%s/ai", gallery.ID)},
		{Key: "settings", Label: "Settings", Href: fmt.Sprintf("/galleries/%s/settings", gallery.ID)},
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"gallery":         gallery,
		"primary_contact": contact,
		"lifecycle_state": service.GalleryWorkspaceLifecycleState(gallery),
		"relationships": map[string]any{
			"primary_contact_id": gallery.PrimaryContactID,
			"contact_id":         gallery.ContactID,
			"project_id":         gallery.ProjectID,
			"event_id":           gallery.EventID,
			"deal_id":            gallery.DealID,
			"invoice_id":         gallery.InvoiceID,
		},
		"sections": sections,
	})
}

// SetFaceDetection handles PATCH /api/v1/galleries/{id}/face-detection
// Body: {"enabled": true|false}
// Toggles the privacy opt-out flag that controls whether the face detection
// ML pipeline runs on assets in this gallery (M3 E8-S1 #6).
func (h *GalleryHandler) SetFaceDetection(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	if _, _, ok := h.requireGalleryInWorkspace(w, r, id); !ok {
		return
	}
	var input struct {
		Enabled *bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	if input.Enabled == nil {
		http.Error(w, `{"error":"enabled field required"}`, http.StatusBadRequest)
		return
	}
	if err := h.gallerySvc.SetFaceDetectionEnabled(r.Context(), id, *input.Enabled); err != nil {
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"gallery_id":             id,
		"face_detection_enabled": *input.Enabled,
	})
}

// SoftDelete handles DELETE /api/v1/galleries/{id}
func (h *GalleryHandler) SoftDelete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	if _, workspaceID, ok := h.requireGalleryInWorkspace(w, r, id); !ok {
		return
	} else if err := h.gallerySvc.SoftDeleteForWorkspace(r.Context(), id, workspaceID); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// AddAsset handles POST /api/v1/galleries/{id}/assets
func (h *GalleryHandler) AddAsset(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	_, workspaceID, ok := h.requireGalleryInWorkspace(w, r, galleryID)
	if !ok {
		return
	}

	var input struct {
		AssetID   string `json:"asset_id"`
		SortOrder int    `json:"sort_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	assetID, err := uuid.Parse(input.AssetID)
	if err != nil {
		http.Error(w, `{"error":"invalid asset_id"}`, http.StatusBadRequest)
		return
	}

	if err := h.gallerySvc.AddAsset(r.Context(), galleryID, assetID, workspaceID, input.SortOrder); err != nil {
		if errors.Is(err, repository.ErrAssetNotInWorkspace) {
			http.Error(w, `{"error":"asset not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"add asset failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

// DuplicateGallery handles POST /api/v1/galleries/{id}/duplicate
func (h *GalleryHandler) DuplicateGallery(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	wsIDStr, _ := claims["workspace_id"].(string)
	userIDStr, _ := claims["user_id"].(string)
	userID, _ := uuid.Parse(userIDStr)
	wsID, _ := uuid.Parse(wsIDStr)

	// Verify source gallery belongs to this workspace
	src, err := h.gallerySvc.GetByID(r.Context(), galleryID)
	if err != nil || src == nil {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}
	if src.WorkspaceID != wsID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var input struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.Title == "" {
		input.Title = src.Title + " (Copy)"
	}

	dup, err := h.gallerySvc.DuplicateGallery(r.Context(), galleryID, input.Title, userID)
	if err != nil {
		http.Error(w, `{"error":"duplicate failed"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(dup)
}

// ReorderAssets handles PATCH /api/v1/galleries/{id}/assets/reorder
func (h *GalleryHandler) ReorderAssets(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	if _, _, ok := h.requireGalleryInWorkspace(w, r, galleryID); !ok {
		return
	}

	var input struct {
		Order []struct {
			AssetID   string `json:"asset_id"`
			SortOrder int    `json:"sort_order"`
		} `json:"order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	if len(input.Order) == 0 {
		http.Error(w, `{"error":"order array is required"}`, http.StatusBadRequest)
		return
	}

	items := make([]repository.ReorderItem, 0, len(input.Order))
	for _, item := range input.Order {
		assetID, err := uuid.Parse(item.AssetID)
		if err != nil {
			continue
		}
		items = append(items, repository.ReorderItem{AssetID: assetID, SortOrder: item.SortOrder})
	}

	if err := h.gallerySvc.ReorderAssets(r.Context(), galleryID, items); err != nil {
		http.Error(w, `{"error":"reorder failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// RemoveAsset handles DELETE /api/v1/galleries/{id}/assets/{assetId}
func (h *GalleryHandler) RemoveAsset(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	if _, _, ok := h.requireGalleryInWorkspace(w, r, galleryID); !ok {
		return
	}
	assetID, err := uuid.Parse(chi.URLParam(r, "assetId"))
	if err != nil {
		http.Error(w, `{"error":"invalid asset id"}`, http.StatusBadRequest)
		return
	}

	if err := h.gallerySvc.RemoveAsset(r.Context(), galleryID, assetID); err != nil {
		http.Error(w, `{"error":"remove asset failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Timeline handles GET /api/v1/galleries/{id}/assets/timeline
func (h *GalleryHandler) Timeline(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	if _, _, ok := h.requireGalleryInWorkspace(w, r, galleryID); !ok {
		return
	}

	groups, err := h.gallerySvc.GetTimeline(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"timeline failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, groups)
}

// ListAssets handles GET /api/v1/galleries/{id}/assets
func (h *GalleryHandler) ListAssets(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	if _, _, ok := h.requireGalleryInWorkspace(w, r, galleryID); !ok {
		return
	}

	assets, err := h.gallerySvc.ListAssets(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}

	// PERF-23: ?include_assets=true hydrates the whole page server-side with one
	// bulk asset query and embeds each asset on its junction row, so the
	// dashboard doesn't loop getAsset() per asset (an N+1 that scaled with
	// gallery size). The default response shape is unchanged for callers that
	// don't opt in.
	if r.URL.Query().Get("include_assets") == "true" {
		enriched, err := h.enrichGalleryAssets(r.Context(), assets)
		if err != nil {
			http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
			return
		}
		respondJSON(w, http.StatusOK, enriched)
		return
	}

	respondJSON(w, http.StatusOK, assets)
}

// ──────────────────────────────────────────────────────────────────────────────
// M21: Gallery Face Scan Trigger
// ──────────────────────────────────────────────────────────────────────────────

// TriggerFaceScan handles POST /api/v1/galleries/{id}/ai/scan-faces.
// Enqueues a face detection job for all assets in the gallery.
func (h *GalleryHandler) TriggerFaceScan(w http.ResponseWriter, r *http.Request) {
	if h.faceSvc == nil || h.assetSvc == nil {
		http.Error(w, `{"error":"face scan service unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	_, workspaceID, ok := h.requireGalleryInWorkspace(w, r, galleryID)
	if !ok {
		return
	}

	// Get all asset IDs for this gallery
	galleryAssets, err := h.gallerySvc.ListAssets(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"failed to list gallery assets"}`, http.StatusInternalServerError)
		return
	}
	if len(galleryAssets) == 0 {
		http.Error(w, `{"error":"gallery has no assets"}`, http.StatusBadRequest)
		return
	}

	assetIDs := make([]uuid.UUID, len(galleryAssets))
	for i, ga := range galleryAssets {
		assetIDs[i] = ga.AssetID
	}

	gid := galleryID // copy for pointer
	job, err := h.faceSvc.EnqueueDetection(r.Context(), workspaceID, assetIDs, &gid)
	if err != nil {
		http.Error(w, `{"error":"failed to enqueue face scan"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusAccepted, map[string]interface{}{
		"job_id":      job.ID,
		"status":      job.Status,
		"total_items": job.TotalItems,
	})
}

// GetFaceScanStatus handles GET /api/v1/galleries/{id}/ai/scan-status.
// Returns the latest face detection job status for this gallery.
func (h *GalleryHandler) GetFaceScanStatus(w http.ResponseWriter, r *http.Request) {
	if h.jobRepo == nil {
		http.Error(w, `{"error":"face scan service unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	if _, _, ok := h.requireGalleryInWorkspace(w, r, galleryID); !ok {
		return
	}

	job, err := h.jobRepo.GetLatestByGallery(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"failed to get scan status"}`, http.StatusInternalServerError)
		return
	}
	if job == nil {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "none",
			"message": "no face scan has been run for this gallery",
		})
		return
	}

	// Extract faces_found from result if available
	facesFound := 0
	if ff, ok := job.Result["faces_found"]; ok {
		if v, ok := ff.(float64); ok {
			facesFound = int(v)
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"job_id":          job.ID,
		"status":          job.Status,
		"processed_items": job.ProcessedItems,
		"total_items":     job.TotalItems,
		"faces_found":     facesFound,
		"created_at":      job.CreatedAt,
		"updated_at":      job.UpdatedAt,
	})
}
