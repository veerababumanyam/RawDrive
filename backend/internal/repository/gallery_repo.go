package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Gallery represents a photo gallery.
type Gallery struct {
	ID               uuid.UUID              `json:"id"`
	WorkspaceID      uuid.UUID              `json:"workspace_id"`
	ContactID        *uuid.UUID             `json:"contact_id,omitempty"`
	PrimaryContactID *uuid.UUID             `json:"primary_contact_id,omitempty"`
	ProjectID        *uuid.UUID             `json:"project_id,omitempty"`
	EventID          *uuid.UUID             `json:"event_id,omitempty"`
	DealID           *uuid.UUID             `json:"deal_id,omitempty"`
	InvoiceID        *uuid.UUID             `json:"invoice_id,omitempty"`
	Title            string                 `json:"title"`
	Slug             string                 `json:"slug"`
	Description      string                 `json:"description"`
	CoverAssetID     *uuid.UUID             `json:"cover_asset_id,omitempty"`
	GalleryType      string                 `json:"gallery_type"`
	Settings         map[string]interface{} `json:"settings"`
	PasswordHash     *string                `json:"-"`
	WatermarkConfig  map[string]interface{} `json:"watermark_config"`
	IsPublished      bool                   `json:"is_published"`
	MaxSelections    int                    `json:"max_selections"`
	Status           string                 `json:"status"`
	CreatedBy        *uuid.UUID             `json:"created_by,omitempty"`
	CreatedAt        time.Time              `json:"created_at"`
	UpdatedAt        time.Time              `json:"updated_at"`
	PublishedAt      *time.Time             `json:"published_at,omitempty"`
	ArchivedAt       *time.Time             `json:"archived_at,omitempty"`
	DeletedAt        *time.Time             `json:"deleted_at,omitempty"`
	// M19: Gallery Enhancement Suite (F-009) fields
	CoverTemplate    string                 `json:"cover_template"`
	CoverConfig      map[string]interface{} `json:"cover_config"`
	ExpiresAt        *time.Time             `json:"expires_at,omitempty"`
	DownloadEnabled  bool                   `json:"download_enabled"`
	DownloadQuality  string                 `json:"download_quality"`
	SortPreference   string                 `json:"sort_preference"`
	WhatsappTemplate string                 `json:"whatsapp_template"`
	// Face recognition toggles. Migrations 041 + 046 added the columns
	// long ago but the Go struct never exposed them — so the gallery
	// Settings UI's "FaceID entry" + "Face detection" toggles wrote to
	// the PUT endpoint and silently no-op'd (handler ignored the keys,
	// repo Update SQL didn't include them, GetByID didn't read them).
	// Wired through end-to-end here, 2026-05-18.
	//   faceid_enabled         M13 — clients can use a selfie to find their photos. DEFAULT false.
	//   face_detection_enabled M3 E8-S1 — face cluster pipeline opt-out. DEFAULT true.
	FaceIDEnabled        bool `json:"faceid_enabled"`
	FaceDetectionEnabled bool `json:"face_detection_enabled"`
	// AccessMode (migration 041) controls public discoverability/reachability:
	//   public      — reachable by slug AND eligible for discovery surfaces.
	//   unlisted     — reachable by direct slug only; excluded from discovery.
	//   private      — requires a verified share-link / invite session to view.
	//   invite-only  — same gate as private (requires a verified session).
	// Defaults to 'private' at the DB level (migration 041). Read into the
	// struct so the public resolve path can enforce it server-side (S4-G3,
	// integration audit 2026-05-31) — previously it was write-only and every
	// mode was served identically to 'public'.
	AccessMode string `json:"access_mode"`
	// M23: Camera tethering fields (migration 133).
	// TetheringEnabled: desktop app watches TetherDirectory and auto-uploads.
	// TetherDirectory: opaque path string stored at the API level; actual FS
	// access belongs to the desktop companion app, not the Go API.
	TetheringEnabled bool    `json:"tethering_enabled"`
	TetherDirectory  *string `json:"tether_directory,omitempty"`
	// MusicAssetID (Gallery Enhancements June 2026, migration 142): optional
	// background audio track for the client slideshow. References an audio
	// asset (content_type audio/*) that was ingested through the normal
	// asset-upload path, so its bytes already count against the workspace
	// storage quota. Set via UpdateField("music_asset_id", ...) after the
	// handler validates ownership + audio content-type (mirrors logo_asset_id).
	// nil = no music.
	MusicAssetID *uuid.UUID `json:"music_asset_id,omitempty"`
	// EmailAutomationEnabled (Gallery Enhancements June 2026, migration 143):
	// when true, the branded client email drip (ready / reminder / last-chance)
	// runs for this gallery. DB default true → "full auto"; the photographer can
	// turn it off per gallery from settings.
	EmailAutomationEnabled bool `json:"email_automation_enabled"`
	// CoverThumbnails is populated by List() via a LEFT JOIN on assets.
	// Not a database column — only present in list responses.
	CoverThumbnails map[string]string `json:"cover_thumbnails,omitempty"`
	// CoverAsset is a lightweight copy of the effective cover row from List().
	// It prevents dashboard/list cards from fetching one asset per gallery just
	// to render the already-joined thumbnail and encryption metadata.
	CoverAsset *GalleryCoverAsset `json:"cover_asset,omitempty"`
	// Account-share metadata is populated by List() and authenticated read
	// handlers. Owner-only mutations still authorize against WorkspaceID.
	AccessRole                   string     `json:"access_role,omitempty"`
	OwnerWorkspaceID             *uuid.UUID `json:"owner_workspace_id,omitempty"`
	OwnerWorkspaceName           string     `json:"owner_workspace_name,omitempty"`
	StorageBilledToWorkspaceID   *uuid.UUID `json:"storage_billed_to_workspace_id,omitempty"`
	StorageBilledToWorkspaceName string     `json:"storage_billed_to_workspace_name,omitempty"`
}

type GalleryCoverAsset struct {
	ID              uuid.UUID              `json:"id"`
	Filename        string                 `json:"filename,omitempty"`
	ContentType     string                 `json:"content_type,omitempty"`
	Status          string                 `json:"status,omitempty"`
	ThumbnailURLs   map[string]string      `json:"thumbnail_urls,omitempty"`
	IsEncrypted     bool                   `json:"is_encrypted,omitempty"`
	MediaEncryption map[string]interface{} `json:"media_encryption,omitempty"`
}

// GalleryFilter contains filters for listing galleries.
type GalleryFilter struct {
	WorkspaceID uuid.UUID
	Status      string
	GalleryType string
	Search      string
	Limit       int
	Offset      int
}

// GalleryRepo handles gallery persistence.
type GalleryRepo struct {
	pool *pgxpool.Pool
}

// NewGalleryRepo creates a new GalleryRepo.
func NewGalleryRepo(pool *pgxpool.Pool) *GalleryRepo {
	return &GalleryRepo{pool: pool}
}

func (g *Gallery) normalizeWorkspaceLinks() {
	if g.PrimaryContactID == nil && g.ContactID != nil {
		g.PrimaryContactID = g.ContactID
	}
	if g.ContactID == nil && g.PrimaryContactID != nil {
		g.ContactID = g.PrimaryContactID
	}
}

func (g *Gallery) normalizeLifecycleTimestamps(now time.Time) {
	if g.IsPublished && g.PublishedAt == nil {
		publishedAt := now
		g.PublishedAt = &publishedAt
	}
	if g.Status == "archived" {
		if g.ArchivedAt == nil {
			archivedAt := now
			g.ArchivedAt = &archivedAt
		}
		return
	}
	g.ArchivedAt = nil
}

func galleryJSONB(value map[string]interface{}) (string, error) {
	if value == nil {
		value = map[string]interface{}{}
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

func galleryJSONBValue(value any) (string, error) {
	switch v := value.(type) {
	case nil:
		return "{}", nil
	case map[string]interface{}:
		return galleryJSONB(v)
	case []byte:
		if len(v) == 0 {
			return "{}", nil
		}
		if !json.Valid(v) {
			return "", fmt.Errorf("invalid json")
		}
		return string(v), nil
	case json.RawMessage:
		if len(v) == 0 {
			return "{}", nil
		}
		if !json.Valid(v) {
			return "", fmt.Errorf("invalid json")
		}
		return string(v), nil
	case string:
		if v == "" {
			return "{}", nil
		}
		if !json.Valid([]byte(v)) {
			return "", fmt.Errorf("invalid json")
		}
		return v, nil
	default:
		encoded, err := json.Marshal(v)
		if err != nil {
			return "", err
		}
		return string(encoded), nil
	}
}

// generateSlug creates a URL-safe slug from the title.
func generateSlug(title string) string {
	slug := strings.ToLower(title)
	slug = strings.ReplaceAll(slug, " ", "-")
	// Remove non-alphanumeric except hyphens
	var result []byte
	for _, c := range []byte(slug) {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' {
			result = append(result, c)
		}
	}
	slug = string(result)
	// Add random suffix for uniqueness
	suffix := uuid.New().String()[:8]
	return slug + "-" + suffix
}

// Create inserts a new gallery.
func (r *GalleryRepo) Create(ctx context.Context, g *Gallery) error {
	if g.ID == uuid.Nil {
		g.ID = uuid.New()
	}
	if g.Slug == "" {
		g.Slug = generateSlug(g.Title)
	}
	g.CreatedAt = time.Now()
	g.UpdatedAt = g.CreatedAt
	g.normalizeWorkspaceLinks()
	g.normalizeLifecycleTimestamps(g.CreatedAt)

	if g.CoverTemplate == "" {
		g.CoverTemplate = "none"
	}
	if g.SortPreference == "" {
		g.SortPreference = "manual"
	}
	if g.DownloadQuality == "" {
		g.DownloadQuality = "webp"
	}
	g.DownloadEnabled = true

	settingsJSON, err := galleryJSONB(g.Settings)
	if err != nil {
		return fmt.Errorf("gallery repo create settings json: %w", err)
	}
	watermarkJSON, err := galleryJSONB(g.WatermarkConfig)
	if err != nil {
		return fmt.Errorf("gallery repo create watermark json: %w", err)
	}
	coverJSON, err := galleryJSONB(g.CoverConfig)
	if err != nil {
		return fmt.Errorf("gallery repo create cover json: %w", err)
	}

	_, err = r.pool.Exec(ctx,
		`INSERT INTO galleries (id, workspace_id, contact_id, primary_contact_id, project_id, event_id, deal_id, invoice_id,
		 title, slug, description, cover_asset_id,
		 gallery_type, settings, password_hash, watermark_config, is_published, max_selections,
		 status, created_by, created_at, updated_at, published_at, archived_at,
		 cover_template, cover_config, expires_at, download_enabled, download_quality, sort_preference, whatsapp_template,
		 tethering_enabled, tether_directory)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16::jsonb,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb,$27,$28,$29,$30,$31,$32,$33)`,
		g.ID, g.WorkspaceID, g.ContactID, g.PrimaryContactID, g.ProjectID, g.EventID, g.DealID, g.InvoiceID,
		g.Title, g.Slug, g.Description, g.CoverAssetID,
		g.GalleryType, settingsJSON, g.PasswordHash, watermarkJSON, g.IsPublished,
		g.MaxSelections, g.Status, g.CreatedBy, g.CreatedAt, g.UpdatedAt,
		g.PublishedAt, g.ArchivedAt,
		g.CoverTemplate, coverJSON, g.ExpiresAt, g.DownloadEnabled, g.DownloadQuality, g.SortPreference, g.WhatsappTemplate,
		g.TetheringEnabled, g.TetherDirectory,
	)
	if err != nil {
		return fmt.Errorf("gallery repo create: %w", err)
	}
	return nil
}

// Duplicate creates a copy of a gallery with new ID/slug but same settings,
// design config, and album structure. Does NOT copy assets or proofing data.
func (r *GalleryRepo) Duplicate(ctx context.Context, sourceID uuid.UUID, newTitle string, createdBy uuid.UUID) (*Gallery, error) {
	src, err := r.GetByID(ctx, sourceID)
	if err != nil || src == nil {
		return nil, fmt.Errorf("gallery repo duplicate: source not found")
	}

	dup := &Gallery{
		ID:               uuid.New(),
		WorkspaceID:      src.WorkspaceID,
		ContactID:        src.ContactID,
		PrimaryContactID: src.PrimaryContactID,
		ProjectID:        src.ProjectID,
		EventID:          src.EventID,
		DealID:           src.DealID,
		InvoiceID:        src.InvoiceID,
		Title:            newTitle,
		Slug:             generateSlug(newTitle),
		Description:      src.Description,
		GalleryType:      src.GalleryType,
		Settings:         src.Settings,
		WatermarkConfig:  src.WatermarkConfig,
		CoverTemplate:    src.CoverTemplate,
		CoverConfig:      src.CoverConfig,
		DownloadEnabled:  src.DownloadEnabled,
		DownloadQuality:  src.DownloadQuality,
		SortPreference:   src.SortPreference,
		WhatsappTemplate: src.WhatsappTemplate,
		MaxSelections:    src.MaxSelections,
		Status:           "draft",
		CreatedBy:        &createdBy,
	}

	if err := r.Create(ctx, dup); err != nil {
		return nil, fmt.Errorf("gallery repo duplicate create: %w", err)
	}
	return dup, nil
}

// GetByID retrieves a gallery by ID.
func (r *GalleryRepo) GetByID(ctx context.Context, id uuid.UUID) (*Gallery, error) {
	g := &Gallery{}
	query := `SELECT g.id, g.workspace_id, g.contact_id, g.primary_contact_id, g.project_id, g.event_id, g.deal_id, g.invoice_id,
		g.title, g.slug, g.description, cover_asset.id AS effective_cover_asset_id, g.gallery_type,
		g.settings, g.password_hash, g.watermark_config, g.is_published, g.max_selections, g.status,
		g.created_by, g.created_at, g.updated_at, g.published_at, g.archived_at, g.deleted_at,
		g.cover_template, g.cover_config, g.expires_at, g.download_enabled, COALESCE(g.download_quality, 'webp'), g.sort_preference, g.whatsapp_template,
		g.faceid_enabled, g.face_detection_enabled, COALESCE(g.access_mode, 'private'),
		g.tethering_enabled, g.tether_directory, g.music_asset_id, g.email_automation_enabled
		FROM galleries g
		` + galleryEffectiveCoverJoinSQL + `
		WHERE g.id = $1 AND g.deleted_at IS NULL`
	err := r.pool.QueryRow(ctx, query, id).Scan(&g.ID, &g.WorkspaceID, &g.ContactID, &g.PrimaryContactID, &g.ProjectID, &g.EventID, &g.DealID, &g.InvoiceID,
		&g.Title, &g.Slug, &g.Description, &g.CoverAssetID,
		&g.GalleryType, &g.Settings, &g.PasswordHash, &g.WatermarkConfig, &g.IsPublished,
		&g.MaxSelections, &g.Status, &g.CreatedBy, &g.CreatedAt, &g.UpdatedAt, &g.PublishedAt, &g.ArchivedAt, &g.DeletedAt,
		&g.CoverTemplate, &g.CoverConfig, &g.ExpiresAt, &g.DownloadEnabled, &g.DownloadQuality, &g.SortPreference, &g.WhatsappTemplate,
		&g.FaceIDEnabled, &g.FaceDetectionEnabled, &g.AccessMode,
		&g.TetheringEnabled, &g.TetherDirectory, &g.MusicAssetID, &g.EmailAutomationEnabled,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("gallery repo get: %w", err)
	}
	g.normalizeWorkspaceLinks()
	return g, nil
}

// GetBySlug retrieves a gallery by slug (for public access).
func (r *GalleryRepo) GetBySlug(ctx context.Context, slug string) (*Gallery, error) {
	g := &Gallery{}
	query := `SELECT g.id, g.workspace_id, g.contact_id, g.primary_contact_id, g.project_id, g.event_id, g.deal_id, g.invoice_id,
		g.title, g.slug, g.description, cover_asset.id AS effective_cover_asset_id, g.gallery_type,
		g.settings, g.password_hash, g.watermark_config, g.is_published, g.max_selections, g.status,
		g.created_by, g.created_at, g.updated_at, g.published_at, g.archived_at, g.deleted_at,
		g.cover_template, g.cover_config, g.expires_at, g.download_enabled, COALESCE(g.download_quality, 'webp'), g.sort_preference, g.whatsapp_template,
		g.faceid_enabled, g.face_detection_enabled, COALESCE(g.access_mode, 'private'),
		g.tethering_enabled, g.tether_directory, g.music_asset_id, g.email_automation_enabled
		FROM galleries g
		` + galleryEffectiveCoverJoinSQL + `
		WHERE g.slug = $1 AND g.deleted_at IS NULL`
	err := r.pool.QueryRow(ctx, query, slug).Scan(&g.ID, &g.WorkspaceID, &g.ContactID, &g.PrimaryContactID, &g.ProjectID, &g.EventID, &g.DealID, &g.InvoiceID,
		&g.Title, &g.Slug, &g.Description, &g.CoverAssetID,
		&g.GalleryType, &g.Settings, &g.PasswordHash, &g.WatermarkConfig, &g.IsPublished,
		&g.MaxSelections, &g.Status, &g.CreatedBy, &g.CreatedAt, &g.UpdatedAt, &g.PublishedAt, &g.ArchivedAt, &g.DeletedAt,
		&g.CoverTemplate, &g.CoverConfig, &g.ExpiresAt, &g.DownloadEnabled, &g.DownloadQuality, &g.SortPreference, &g.WhatsappTemplate,
		&g.FaceIDEnabled, &g.FaceDetectionEnabled, &g.AccessMode,
		&g.TetheringEnabled, &g.TetherDirectory, &g.MusicAssetID, &g.EmailAutomationEnabled,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("gallery repo get by slug: %w", err)
	}
	g.normalizeWorkspaceLinks()
	return g, nil
}

const galleryEffectiveCoverJoinSQL = `LEFT JOIN LATERAL (
			SELECT a.id, a.filename, a.content_type, a.status, a.is_encrypted,
			       a.media_encryption, a.thumbnail_urls
			FROM gallery_assets ga
			INNER JOIN assets a ON a.id = ga.asset_id
			WHERE ga.gallery_id = g.id
			  AND a.deleted_at IS NULL
			ORDER BY
				CASE WHEN g.cover_asset_id IS NOT NULL AND a.id = g.cover_asset_id THEN 0 ELSE 1 END,
				ga.sort_order ASC,
				ga.added_at ASC
			LIMIT 1
		) cover_asset ON true`

const galleryListBaseQuery = `SELECT g.id, g.workspace_id, g.contact_id, g.primary_contact_id, g.project_id, g.event_id, g.deal_id, g.invoice_id,
		g.title, g.slug, g.description, cover_asset.id AS effective_cover_asset_id,
		g.gallery_type, g.settings, g.password_hash, g.watermark_config, g.is_published,
		g.max_selections, g.status, g.created_by, g.created_at, g.updated_at, g.deleted_at,
		g.published_at, g.archived_at, g.cover_template, g.cover_config, g.expires_at,
		g.download_enabled, COALESCE(g.download_quality, 'webp'), g.sort_preference, g.whatsapp_template,
		g.faceid_enabled, g.face_detection_enabled,
		g.tethering_enabled, g.tether_directory,
		cover_asset.thumbnail_urls,
		cover_asset.filename, cover_asset.content_type, cover_asset.status,
		cover_asset.is_encrypted, cover_asset.media_encryption,
		CASE WHEN g.workspace_id = $1 THEN 'owner' ELSE 'shared' END AS access_role,
		g.workspace_id AS owner_workspace_id,
		COALESCE(owner_ws.name, '') AS owner_workspace_name,
		COALESCE(gws.storage_billed_to_workspace_id, g.workspace_id) AS storage_billed_to_workspace_id,
		COALESCE(billed_ws.name, owner_ws.name, '') AS storage_billed_to_workspace_name
		FROM galleries g
		` + galleryEffectiveCoverJoinSQL + `
		LEFT JOIN gallery_workspace_shares gws
		  ON gws.gallery_id = g.id
		 AND gws.shared_workspace_id = $1
		 AND gws.revoked_at IS NULL
		LEFT JOIN workspaces owner_ws ON owner_ws.id = g.workspace_id
		LEFT JOIN workspaces billed_ws ON billed_ws.id = COALESCE(gws.storage_billed_to_workspace_id, g.workspace_id)
		WHERE (g.workspace_id = $1 OR gws.shared_workspace_id = $1) AND g.deleted_at IS NULL`

// List retrieves galleries matching the filter. Uses a LEFT JOIN on assets
// to include the effective cover asset and cover_thumbnails in one query — no
// N+1 fetching. If a photographer has not selected a cover, the first uploaded
// gallery asset becomes the effective cover for list/dashboard surfaces.
func (r *GalleryRepo) List(ctx context.Context, f GalleryFilter) ([]Gallery, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 50
	}

	query := galleryListBaseQuery
	args := []interface{}{f.WorkspaceID}
	argIdx := 2

	if f.Status != "" {
		query += fmt.Sprintf(" AND g.status = $%d", argIdx)
		args = append(args, f.Status)
		argIdx++
	}
	if f.GalleryType != "" {
		query += fmt.Sprintf(" AND g.gallery_type = $%d", argIdx)
		args = append(args, f.GalleryType)
		argIdx++
	}
	if f.Search != "" {
		query += fmt.Sprintf(" AND (g.title ILIKE $%d OR g.description ILIKE $%d)", argIdx, argIdx)
		args = append(args, "%"+f.Search+"%")
		argIdx++
	}

	query += fmt.Sprintf(" ORDER BY g.created_at DESC LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
	args = append(args, limit, f.Offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("gallery repo list: %w", err)
	}
	defer rows.Close()

	var galleries []Gallery
	for rows.Next() {
		var g Gallery
		var coverThumbs *map[string]string
		var coverFilename *string
		var coverContentType *string
		var coverStatus *string
		var coverIsEncrypted *bool
		var coverMediaEncryption *map[string]interface{}
		var ownerWorkspaceID uuid.UUID
		var storageBilledToWorkspaceID uuid.UUID
		if err := rows.Scan(&g.ID, &g.WorkspaceID, &g.ContactID, &g.PrimaryContactID, &g.ProjectID, &g.EventID, &g.DealID, &g.InvoiceID,
			&g.Title, &g.Slug, &g.Description,
			&g.CoverAssetID, &g.GalleryType, &g.Settings, &g.PasswordHash, &g.WatermarkConfig,
			&g.IsPublished, &g.MaxSelections, &g.Status, &g.CreatedBy, &g.CreatedAt,
			&g.UpdatedAt, &g.DeletedAt, &g.PublishedAt, &g.ArchivedAt,
			&g.CoverTemplate, &g.CoverConfig, &g.ExpiresAt, &g.DownloadEnabled, &g.DownloadQuality, &g.SortPreference, &g.WhatsappTemplate,
			&g.FaceIDEnabled, &g.FaceDetectionEnabled,
			&g.TetheringEnabled, &g.TetherDirectory,
			&coverThumbs,
			&coverFilename, &coverContentType, &coverStatus,
			&coverIsEncrypted, &coverMediaEncryption,
			&g.AccessRole, &ownerWorkspaceID, &g.OwnerWorkspaceName,
			&storageBilledToWorkspaceID, &g.StorageBilledToWorkspaceName,
		); err != nil {
			return nil, fmt.Errorf("gallery repo list scan: %w", err)
		}
		g.normalizeWorkspaceLinks()
		g.OwnerWorkspaceID = &ownerWorkspaceID
		g.StorageBilledToWorkspaceID = &storageBilledToWorkspaceID
		if coverThumbs != nil {
			g.CoverThumbnails = *coverThumbs
		}
		if g.CoverAssetID != nil {
			coverAsset := &GalleryCoverAsset{ID: *g.CoverAssetID}
			if coverFilename != nil {
				coverAsset.Filename = *coverFilename
			}
			if coverContentType != nil {
				coverAsset.ContentType = *coverContentType
			}
			if coverStatus != nil {
				coverAsset.Status = *coverStatus
			}
			if coverThumbs != nil {
				coverAsset.ThumbnailURLs = *coverThumbs
			}
			if coverIsEncrypted != nil {
				coverAsset.IsEncrypted = *coverIsEncrypted
			}
			if coverMediaEncryption != nil {
				coverAsset.MediaEncryption = *coverMediaEncryption
			}
			g.CoverAsset = coverAsset
		}
		galleries = append(galleries, g)
	}
	return galleries, rows.Err()
}

// Update modifies a gallery's fields.
func (r *GalleryRepo) Update(ctx context.Context, g *Gallery) error {
	g.UpdatedAt = time.Now()
	g.normalizeWorkspaceLinks()
	g.normalizeLifecycleTimestamps(g.UpdatedAt)

	settingsJSON, err := galleryJSONB(g.Settings)
	if err != nil {
		return fmt.Errorf("gallery repo update settings json: %w", err)
	}
	watermarkJSON, err := galleryJSONB(g.WatermarkConfig)
	if err != nil {
		return fmt.Errorf("gallery repo update watermark json: %w", err)
	}
	coverJSON, err := galleryJSONB(g.CoverConfig)
	if err != nil {
		return fmt.Errorf("gallery repo update cover json: %w", err)
	}

	tag, err := r.pool.Exec(ctx,
		`UPDATE galleries SET contact_id=$1, primary_contact_id=$2, project_id=$3, event_id=$4, deal_id=$5, invoice_id=$6,
		 title=$7, slug=$8, description=$9, cover_asset_id=$10,
		 gallery_type=$11, settings=$12::jsonb, password_hash=$13, watermark_config=$14::jsonb,
		 is_published=$15, max_selections=$16, status=$17, updated_at=$18, published_at=$19, archived_at=$20,
		 cover_template=$21, cover_config=$22::jsonb, expires_at=$23, download_enabled=$24, download_quality=$25,
		 sort_preference=$26, whatsapp_template=$27,
		 faceid_enabled=$28, face_detection_enabled=$29,
		 tethering_enabled=$30, tether_directory=$31,
		 email_automation_enabled=$32
		 WHERE id=$33 AND deleted_at IS NULL`,
		g.ContactID, g.PrimaryContactID, g.ProjectID, g.EventID, g.DealID, g.InvoiceID,
		g.Title, g.Slug, g.Description, g.CoverAssetID, g.GalleryType, settingsJSON,
		g.PasswordHash, watermarkJSON, g.IsPublished, g.MaxSelections, g.Status,
		g.UpdatedAt, g.PublishedAt, g.ArchivedAt, g.CoverTemplate, coverJSON, g.ExpiresAt, g.DownloadEnabled,
		g.DownloadQuality, g.SortPreference, g.WhatsappTemplate, g.FaceIDEnabled, g.FaceDetectionEnabled,
		g.TetheringEnabled, g.TetherDirectory, g.EmailAutomationEnabled, g.ID,
	)
	if err != nil {
		return fmt.Errorf("gallery repo update: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("gallery not found or already deleted")
	}
	return nil
}

// SoftDelete marks a gallery as deleted and best-effort cleans up any
// orphaned contact rows that were only linked through this gallery.
//
// QA Issue #3 (RawDrive_NewUniqueIssues.xlsx): the prior implementation
// only set deleted_at on the gallery row, leaving the gallery's
// primary_contact_id / contact_id contact visible on the Clients screen.
// Most photographers create a contact implicitly when setting up a
// gallery (the "client" name on the form), so an orphan check tied to
// gallery deletion is the right cleanup boundary.
//
// Cleanup contract (intentionally conservative):
//   - Only contacts referenced by NO other live (deleted_at IS NULL)
//     gallery row are eligible.
//   - The plain DELETE is attempted; any FK RESTRICT from leads, deals,
//     contracts, invoices, calendar_events, or projects causes the
//     delete to fail at the database level. We swallow that error
//     because it is the signal that the contact has independent CRM
//     activity and must be preserved.
//   - The whole sequence runs in a single transaction so a partial
//     failure cannot leave the gallery soft-deleted but the cleanup
//     half-applied.
func (r *GalleryRepo) SoftDelete(ctx context.Context, id uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("gallery repo delete: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck — Commit() shadows; Rollback on error is best-effort

	// Capture both contact links before mutating the row so we know
	// what to consider for cleanup. Both columns are nullable; either
	// (or both) may be set depending on the era of the gallery row.
	var primaryContactID, legacyContactID *uuid.UUID
	err = tx.QueryRow(ctx,
		`SELECT primary_contact_id, contact_id FROM galleries WHERE id=$1 AND deleted_at IS NULL`,
		id,
	).Scan(&primaryContactID, &legacyContactID)
	if err != nil {
		return fmt.Errorf("gallery repo delete: read contact links: %w", err)
	}

	now := time.Now()
	tag, err := tx.Exec(ctx,
		`UPDATE galleries SET deleted_at=$1, updated_at=$1 WHERE id=$2 AND deleted_at IS NULL`,
		now, id,
	)
	if err != nil {
		return fmt.Errorf("gallery repo delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("gallery not found or already deleted")
	}

	// Best-effort cleanup of contacts that were only linked through
	// this gallery. The NOT EXISTS guard ensures we never delete a
	// contact that is still referenced by another live gallery (which
	// would silently null-out that gallery's link via ON DELETE SET
	// NULL). The DELETE itself is guarded by the FK RESTRICT semantics
	// on every CRM-side reference, so any contact with leads, deals,
	// contracts, invoices, projects, or calendar events survives.
	//
	// SAVEPOINT is mandatory here. In PostgreSQL, any error inside a
	// transaction (including FK violations) marks the entire tx as
	// aborted — subsequent statements, including COMMIT, all fail.
	// Without SAVEPOINT, a contact with CRM dependencies would abort
	// the tx and cause the gallery delete itself to return 500 even
	// though the gallery row was already updated in this same tx.
	cleanup := func(contactID uuid.UUID) {
		if contactID == uuid.Nil {
			return
		}
		_, _ = tx.Exec(ctx, "SAVEPOINT cleanup_contact")
		_, err := tx.Exec(ctx,
			`DELETE FROM contacts WHERE id = $1
			 AND NOT EXISTS (
			   SELECT 1 FROM galleries g
			   WHERE (g.primary_contact_id = $1 OR g.contact_id = $1)
			     AND g.deleted_at IS NULL
			     AND g.id <> $2
			 )`,
			contactID, id,
		)
		if err != nil {
			_, _ = tx.Exec(ctx, "ROLLBACK TO SAVEPOINT cleanup_contact")
		} else {
			_, _ = tx.Exec(ctx, "RELEASE SAVEPOINT cleanup_contact")
		}
	}
	if primaryContactID != nil {
		cleanup(*primaryContactID)
	}
	// Skip the legacy column when it duplicates the primary link to
	// avoid a redundant query against the same contact id.
	if legacyContactID != nil &&
		(primaryContactID == nil || *primaryContactID != *legacyContactID) {
		cleanup(*legacyContactID)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("gallery repo delete: commit: %w", err)
	}
	return nil
}

// UpdateCover sets the gallery's cover asset.
func (r *GalleryRepo) UpdateCover(ctx context.Context, galleryID uuid.UUID, coverAssetID *uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE galleries SET cover_asset_id=$1, updated_at=now() WHERE id=$2`,
		coverAssetID, galleryID,
	)
	if err != nil {
		return fmt.Errorf("gallery repo update cover: %w", err)
	}
	return nil
}

// UpdateStatus changes the gallery's status field.
func (r *GalleryRepo) UpdateStatus(ctx context.Context, galleryID uuid.UUID, status string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE galleries
		 SET status=$1,
		     is_published = CASE WHEN $1 IN ('shared', 'protected', 'published') THEN true WHEN $1 = 'draft' THEN false ELSE is_published END,
		     published_at = CASE WHEN $1 IN ('shared', 'protected', 'published') THEN COALESCE(published_at, now()) ELSE published_at END,
		     archived_at = CASE WHEN $1 = 'archived' THEN COALESCE(archived_at, now()) ELSE NULL END,
		     updated_at=now()
		 WHERE id=$2`,
		status, galleryID,
	)
	if err != nil {
		return fmt.Errorf("gallery repo update status: %w", err)
	}
	return nil
}

// UpdateField updates a single column on a gallery. The column must be a valid gallery column.
func (r *GalleryRepo) UpdateField(ctx context.Context, galleryID uuid.UUID, field string, value any) error {
	allowedFields := map[string]bool{
		"password_hash": true, "access_mode": true, "proofing_deadline": true,
		"faceid_enabled": true, "cover_config": true,
		"face_detection_enabled": true, // M3 E8-S1 #6: privacy opt-out
		// M19: Gallery Enhancement Suite (F-009)
		"cover_template": true, "expires_at": true, "download_enabled": true, "download_quality": true,
		"sort_preference": true, "whatsapp_template": true, "watermark_config": true,
		"music_asset_id": true, // Gallery Enhancements June 2026 — slideshow background track

		"contact_id": true, "primary_contact_id": true, "project_id": true,
		"event_id": true, "deal_id": true, "invoice_id": true,
		"published_at": true, "archived_at": true,
	}
	if !allowedFields[field] {
		return fmt.Errorf("gallery repo: field %q is not updatable via UpdateField", field)
	}
	if field == "cover_config" || field == "watermark_config" {
		jsonValue, err := galleryJSONBValue(value)
		if err != nil {
			return fmt.Errorf("gallery repo update field %s json: %w", field, err)
		}
		value = jsonValue
	}
	placeholder := "$1"
	if field == "cover_config" || field == "watermark_config" {
		placeholder = "$1::jsonb"
	}
	query := fmt.Sprintf(`UPDATE galleries SET %s=%s, updated_at=now() WHERE id=$2`, field, placeholder)
	_, err := r.pool.Exec(ctx, query, value, galleryID)
	if err != nil {
		return fmt.Errorf("gallery repo update field %s: %w", field, err)
	}
	return nil
}

// ClearMusicAsset nulls galleries.music_asset_id for every gallery in the
// workspace that currently references assetID. It is the cascade half of
// deleting a workspace music-library track (DELETE /api/v1/music/{id}): once
// the audio asset is soft-deleted, any gallery still pointing at it would
// otherwise 404 its slideshow music, so the pointer is cleared. Scoped by
// workspace_id so a caller can only ever clear references within their own
// tenant (cross-tenant safe). Idempotent — clearing a track no gallery
// references simply affects zero rows.
func (r *GalleryRepo) ClearMusicAsset(ctx context.Context, workspaceID, assetID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE galleries SET music_asset_id = NULL, updated_at = now()
		 WHERE workspace_id = $1 AND music_asset_id = $2`,
		workspaceID, assetID,
	)
	if err != nil {
		return fmt.Errorf("gallery repo clear music asset: %w", err)
	}
	return nil
}

// IsFaceDetectionEnabled returns whether the gallery opts into the face
// detection ML pipeline. Used by the face worker to skip privacy-opted-out
// galleries. A missing gallery returns (false, error) so workers fail
// closed rather than processing an unknown gallery.
//
// Added for M3 E8-S1 #6 (privacy opt-out).
func (r *GalleryRepo) IsFaceDetectionEnabled(ctx context.Context, galleryID uuid.UUID) (bool, error) {
	var enabled bool
	err := r.pool.QueryRow(ctx,
		`SELECT face_detection_enabled FROM galleries WHERE id = $1 AND deleted_at IS NULL`,
		galleryID,
	).Scan(&enabled)
	if err == pgx.ErrNoRows {
		return false, fmt.Errorf("gallery %s not found", galleryID)
	}
	if err != nil {
		return false, fmt.Errorf("gallery repo face detection check: %w", err)
	}
	return enabled, nil
}

// TetheredGallery is the minimal shape returned by ListTethered —
// only the fields the desktop companion app needs to watch a directory.
type TetheredGallery struct {
	ID               uuid.UUID `json:"id"`
	Title            string    `json:"title"`
	WorkspaceID      uuid.UUID `json:"workspace_id"`
	TetherDirectory  *string   `json:"tether_directory"`
	TetheringEnabled bool      `json:"tethering_enabled"`
}

// ListTethered returns galleries in workspaceID that have tethering_enabled=true.
// Used by the desktop companion app to discover which local directories to watch.
func (r *GalleryRepo) ListTethered(ctx context.Context, workspaceID uuid.UUID) ([]TetheredGallery, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, title, workspace_id, tether_directory, tethering_enabled
		 FROM galleries
		 WHERE workspace_id = $1 AND tethering_enabled = true AND deleted_at IS NULL
		 ORDER BY created_at DESC`,
		workspaceID,
	)
	if err != nil {
		return nil, fmt.Errorf("gallery repo list tethered: %w", err)
	}
	defer rows.Close()

	var results []TetheredGallery
	for rows.Next() {
		var g TetheredGallery
		if err := rows.Scan(&g.ID, &g.Title, &g.WorkspaceID, &g.TetherDirectory, &g.TetheringEnabled); err != nil {
			return nil, fmt.Errorf("gallery repo list tethered scan: %w", err)
		}
		results = append(results, g)
	}
	return results, rows.Err()
}
