package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

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
	albumSvc   *service.AlbumService
	bannerSvc  *service.BannerService
	productSvc *service.ProductService

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
	assetBatch    publicAssetBatchSource
	publicBaseURL string
	mediaKeyRepo  *repository.GalleryMediaKeyRepo
	storageSvc    *service.StorageAccounting
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

// WithClientPreviewDeps injects the read-only services needed by the
// authenticated owner "Preview as client" payload. All dependencies are
// optional so route registration remains nil-safe in older test harnesses.
func (h *GalleryHandler) WithClientPreviewDeps(albumSvc *service.AlbumService, bannerSvc *service.BannerService, productSvc *service.ProductService, publicBaseURL string) *GalleryHandler {
	h.albumSvc = albumSvc
	h.bannerSvc = bannerSvc
	h.productSvc = productSvc
	h.publicBaseURL = publicBaseURL
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

// WithMediaKeyRepo injects the owner-authenticated gallery media-key registry.
// It is optional so older test harnesses keep compiling; routes return 503 when
// the repo is not wired.
func (h *GalleryHandler) WithMediaKeyRepo(repo *repository.GalleryMediaKeyRepo) *GalleryHandler {
	h.mediaKeyRepo = repo
	return h
}

// WithStorageAccounting injects cache invalidation for account-share storage
// attribution changes. The share routes run through h.pool for transactions.
func (h *GalleryHandler) WithStorageAccounting(svc *service.StorageAccounting) *GalleryHandler {
	h.storageSvc = svc
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

type galleryAccountShareResponse struct {
	ID                           uuid.UUID  `json:"id"`
	GalleryID                    uuid.UUID  `json:"gallery_id"`
	Status                       string     `json:"status"`
	OwnerWorkspaceID             uuid.UUID  `json:"owner_workspace_id"`
	OwnerWorkspaceName           string     `json:"owner_workspace_name"`
	SharedWorkspaceID            uuid.UUID  `json:"shared_workspace_id"`
	SharedWorkspaceName          string     `json:"shared_workspace_name"`
	SharedUserEmail              string     `json:"shared_user_email,omitempty"`
	PendingEmail                 string     `json:"pending_email,omitempty"`
	ShareLinkToken               string     `json:"share_link_token,omitempty"`
	StorageBilledToWorkspaceID   uuid.UUID  `json:"storage_billed_to_workspace_id"`
	StorageBilledToWorkspaceName string     `json:"storage_billed_to_workspace_name"`
	StorageBilledTo              string     `json:"storage_billed_to"`
	MigrateStorageUsage          bool       `json:"migrate_storage_usage"`
	MigratedOriginalBytes        int64      `json:"migrated_original_bytes"`
	MigratedDerivativeBytes      int64      `json:"migrated_derivative_bytes"`
	StorageMigratedAt            *time.Time `json:"storage_migrated_at,omitempty"`
	CreatedAt                    time.Time  `json:"created_at"`
	UpdatedAt                    time.Time  `json:"updated_at"`
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

const (
	gallerySlideshowIntervalMinMS = 2000
	gallerySlideshowIntervalMaxMS = 15000
)

func decodeGallerySlideshowIntervalMS(value json.RawMessage) (int, error) {
	var intervalMS int
	if err := json.Unmarshal(value, &intervalMS); err != nil {
		return 0, fmt.Errorf("invalid slideshow_interval_ms")
	}
	if intervalMS < gallerySlideshowIntervalMinMS || intervalMS > gallerySlideshowIntervalMaxMS {
		return 0, fmt.Errorf(
			"slideshow_interval_ms must be between %d and %d",
			gallerySlideshowIntervalMinMS,
			gallerySlideshowIntervalMaxMS,
		)
	}
	return intervalMS, nil
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

func (h *GalleryHandler) requireGalleryReadable(w http.ResponseWriter, r *http.Request, galleryID uuid.UUID) (*repository.Gallery, uuid.UUID, bool) {
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
	if gallery == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return nil, uuid.Nil, false
	}
	ownerWorkspaceID := gallery.WorkspaceID
	gallery.OwnerWorkspaceID = &ownerWorkspaceID
	gallery.StorageBilledToWorkspaceID = &ownerWorkspaceID
	gallery.AccessRole = "owner"
	if gallery.WorkspaceID == workspaceID {
		if h.pool != nil {
			_ = h.pool.QueryRow(r.Context(),
				`SELECT COALESCE(name, '') FROM workspaces WHERE id = $1`,
				gallery.WorkspaceID,
			).Scan(&gallery.OwnerWorkspaceName)
			gallery.StorageBilledToWorkspaceName = gallery.OwnerWorkspaceName
		}
		return gallery, workspaceID, true
	}
	if h.pool == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return nil, uuid.Nil, false
	}
	var billedWorkspaceID uuid.UUID
	var ownerName, billedName string
	err = h.pool.QueryRow(r.Context(),
		`SELECT COALESCE(owner_ws.name, ''),
		        s.storage_billed_to_workspace_id,
		        COALESCE(billed_ws.name, owner_ws.name, '')
		   FROM gallery_workspace_shares s
		   JOIN workspaces owner_ws ON owner_ws.id = s.owner_workspace_id
		   LEFT JOIN workspaces billed_ws ON billed_ws.id = s.storage_billed_to_workspace_id
		  WHERE s.gallery_id = $1
		    AND s.shared_workspace_id = $2
		    AND s.revoked_at IS NULL
		  LIMIT 1`,
		galleryID, workspaceID,
	).Scan(&ownerName, &billedWorkspaceID, &billedName)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return nil, uuid.Nil, false
	}
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return nil, uuid.Nil, false
	}
	gallery.AccessRole = "shared"
	gallery.OwnerWorkspaceName = ownerName
	gallery.StorageBilledToWorkspaceID = &billedWorkspaceID
	gallery.StorageBilledToWorkspaceName = billedName
	return gallery, workspaceID, true
}

func scanGalleryAccountShare(row pgx.Row) (galleryAccountShareResponse, error) {
	var share galleryAccountShareResponse
	err := row.Scan(
		&share.ID,
		&share.GalleryID,
		&share.OwnerWorkspaceID,
		&share.OwnerWorkspaceName,
		&share.SharedWorkspaceID,
		&share.SharedWorkspaceName,
		&share.SharedUserEmail,
		&share.StorageBilledToWorkspaceID,
		&share.StorageBilledToWorkspaceName,
		&share.MigrateStorageUsage,
		&share.MigratedOriginalBytes,
		&share.MigratedDerivativeBytes,
		&share.StorageMigratedAt,
		&share.CreatedAt,
		&share.UpdatedAt,
	)
	if err != nil {
		return share, err
	}
	share.Status = "active"
	share.StorageBilledTo = "owner"
	if share.StorageBilledToWorkspaceID == share.SharedWorkspaceID {
		share.StorageBilledTo = "shared"
	}
	return share, nil
}

func pendingGalleryAccountShareResponse(id, galleryID, ownerWorkspaceID uuid.UUID, token, email, storageBilledTo string, migrateStorageUsage bool, createdAt time.Time) galleryAccountShareResponse {
	return galleryAccountShareResponse{
		ID:                         id,
		GalleryID:                  galleryID,
		Status:                     "pending_invite",
		OwnerWorkspaceID:           ownerWorkspaceID,
		SharedUserEmail:            email,
		PendingEmail:               email,
		ShareLinkToken:             token,
		StorageBilledToWorkspaceID: ownerWorkspaceID,
		StorageBilledTo:            storageBilledTo,
		MigrateStorageUsage:        migrateStorageUsage,
		CreatedAt:                  createdAt,
		UpdatedAt:                  createdAt,
	}
}

func accountShareInvitePermissions(email, storageBilledTo string, migrateStorageUsage bool) (string, error) {
	permissions := map[string]any{
		"access_mode":           "email",
		"allowed_emails":        []string{email},
		"recipient_emails":      []string{email},
		"account_share_invite":  true,
		"pending_email":         email,
		"storage_billed_to":     storageBilledTo,
		"migrate_storage_usage": migrateStorageUsage,
		"channel":               "account_share",
	}
	encoded, err := json.Marshal(permissions)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

func parsePendingAccountShareInvite(galleryID, ownerWorkspaceID uuid.UUID, id uuid.UUID, token string, permissionsJSON []byte, createdAt time.Time) (galleryAccountShareResponse, bool) {
	var permissions map[string]any
	if err := json.Unmarshal(permissionsJSON, &permissions); err != nil {
		return galleryAccountShareResponse{}, false
	}
	if value, _ := permissions["account_share_invite"].(bool); !value {
		return galleryAccountShareResponse{}, false
	}
	email, _ := permissions["pending_email"].(string)
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		if values, ok := permissions["allowed_emails"].([]any); ok && len(values) > 0 {
			email, _ = values[0].(string)
			email = strings.ToLower(strings.TrimSpace(email))
		}
	}
	if email == "" {
		return galleryAccountShareResponse{}, false
	}
	storageBilledTo, _ := permissions["storage_billed_to"].(string)
	storageBilledTo, err := normalizeStorageBilledTo(storageBilledTo)
	if err != nil {
		storageBilledTo = "owner"
	}
	migrateStorageUsage, _ := permissions["migrate_storage_usage"].(bool)
	return pendingGalleryAccountShareResponse(id, galleryID, ownerWorkspaceID, token, email, storageBilledTo, migrateStorageUsage, createdAt), true
}

const galleryAccountShareSelectColumnsSQL = `SELECT s.id,
       s.gallery_id,
       s.owner_workspace_id,
       COALESCE(owner_ws.name, '') AS owner_workspace_name,
       s.shared_workspace_id,
       COALESCE(shared_ws.name, '') AS shared_workspace_name,
       COALESCE(shared_user.email, '') AS shared_user_email,
       s.storage_billed_to_workspace_id,
       COALESCE(billed_ws.name, '') AS storage_billed_to_workspace_name,
       s.migrate_storage_usage,
       s.migrated_original_bytes,
       s.migrated_derivative_bytes,
       s.storage_migrated_at,
       s.created_at,
       s.updated_at`

const galleryAccountShareSelectJoinsSQL = `
  JOIN workspaces owner_ws ON owner_ws.id = s.owner_workspace_id
  JOIN workspaces shared_ws ON shared_ws.id = s.shared_workspace_id
  LEFT JOIN users shared_user ON shared_user.id = shared_ws.owner_id
  JOIN workspaces billed_ws ON billed_ws.id = s.storage_billed_to_workspace_id`

const galleryAccountShareSelectSQL = galleryAccountShareSelectColumnsSQL + `
  FROM gallery_workspace_shares s` + galleryAccountShareSelectJoinsSQL

func normalizeStorageBilledTo(value string) (string, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return "owner", nil
	}
	if value != "owner" && value != "shared" {
		return "", fmt.Errorf("storage_billed_to must be owner or shared")
	}
	return value, nil
}

func (h *GalleryHandler) galleryStorageFootprint(ctx context.Context, tx pgx.Tx, galleryID uuid.UUID) (int64, int64, error) {
	var originalBytes, derivativeBytes int64
	err := tx.QueryRow(ctx,
		`WITH gallery_asset_ids AS (
		    SELECT DISTINCT ga.asset_id
		      FROM gallery_assets ga
		      JOIN assets a ON a.id = ga.asset_id
		     WHERE ga.gallery_id = $1
		       AND a.deleted_at IS NULL
		  ),
		  originals AS (
		    SELECT COALESCE(SUM(a.size_bytes), 0)::bigint AS bytes
		      FROM assets a
		      JOIN gallery_asset_ids gai ON gai.asset_id = a.id
		  ),
		  derivatives AS (
		    SELECT COALESCE(SUM(ad.size_bytes), 0)::bigint AS bytes
		      FROM asset_derivatives ad
		      JOIN gallery_asset_ids gai ON gai.asset_id = ad.asset_id
		  )
		  SELECT originals.bytes, derivatives.bytes
		    FROM originals, derivatives`,
		galleryID,
	).Scan(&originalBytes, &derivativeBytes)
	if err != nil {
		return 0, 0, err
	}
	return originalBytes, derivativeBytes, nil
}

func (h *GalleryHandler) moveWorkspaceStorageUsage(ctx context.Context, tx pgx.Tx, fromWorkspaceID, toWorkspaceID uuid.UUID, originalBytes, derivativeBytes int64) error {
	if (originalBytes <= 0 && derivativeBytes <= 0) || fromWorkspaceID == toWorkspaceID {
		return nil
	}
	for _, workspaceID := range []uuid.UUID{fromWorkspaceID, toWorkspaceID} {
		if _, err := tx.Exec(ctx,
			`INSERT INTO workspace_storage (workspace_id, used_bytes, derivative_bytes, quota_bytes)
			 SELECT $1, 0, 0, 0
			  WHERE EXISTS (SELECT 1 FROM workspaces WHERE id = $1)
			 ON CONFLICT (workspace_id) DO NOTHING`,
			workspaceID,
		); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx,
		`UPDATE workspace_storage
		    SET used_bytes = GREATEST(0, used_bytes - $2),
		        derivative_bytes = GREATEST(0, derivative_bytes - $3),
		        updated_at = NOW()
		  WHERE workspace_id = $1`,
		fromWorkspaceID, originalBytes, derivativeBytes,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE workspace_storage
		    SET used_bytes = used_bytes + $2,
		        derivative_bytes = derivative_bytes + $3,
		        updated_at = NOW()
		  WHERE workspace_id = $1`,
		toWorkspaceID, originalBytes, derivativeBytes,
	); err != nil {
		return err
	}
	return nil
}

func (h *GalleryHandler) invalidateStorageAnalytics(workspaceIDs ...uuid.UUID) {
	if h.storageSvc == nil {
		return
	}
	seen := make(map[uuid.UUID]struct{}, len(workspaceIDs))
	for _, workspaceID := range workspaceIDs {
		if workspaceID == uuid.Nil {
			continue
		}
		if _, ok := seen[workspaceID]; ok {
			continue
		}
		seen[workspaceID] = struct{}{}
		h.storageSvc.InvalidateAnalytics(workspaceID)
	}
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

	gallery, _, ok := h.requireGalleryReadable(w, r, id)
	if !ok {
		return
	}

	respondJSON(w, http.StatusOK, gallery)
}

// ListAccountShares handles GET /api/v1/galleries/{id}/account-shares.
func (h *GalleryHandler) ListAccountShares(w http.ResponseWriter, r *http.Request) {
	if h.pool == nil {
		http.Error(w, `{"error":"account sharing unavailable"}`, http.StatusServiceUnavailable)
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

	rows, err := h.pool.Query(r.Context(),
		galleryAccountShareSelectSQL+`
		 WHERE s.gallery_id = $1
		   AND s.owner_workspace_id = $2
		   AND s.revoked_at IS NULL
		 ORDER BY s.created_at DESC`,
		galleryID, workspaceID,
	)
	if err != nil {
		http.Error(w, `{"error":"share list failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	shares := make([]galleryAccountShareResponse, 0)
	for rows.Next() {
		share, err := scanGalleryAccountShare(rows)
		if err != nil {
			http.Error(w, `{"error":"share list failed"}`, http.StatusInternalServerError)
			return
		}
		shares = append(shares, share)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, `{"error":"share list failed"}`, http.StatusInternalServerError)
		return
	}

	pendingRows, err := h.pool.Query(r.Context(),
		`SELECT id, token, permissions, created_at
		   FROM share_links
		  WHERE gallery_id = $1
		    AND revoked_at IS NULL
		    AND permissions->>'account_share_invite' = 'true'
		  ORDER BY created_at DESC`,
		galleryID,
	)
	if err != nil {
		http.Error(w, `{"error":"share list failed"}`, http.StatusInternalServerError)
		return
	}
	defer pendingRows.Close()
	for pendingRows.Next() {
		var id uuid.UUID
		var token string
		var permissionsJSON []byte
		var createdAt time.Time
		if err := pendingRows.Scan(&id, &token, &permissionsJSON, &createdAt); err != nil {
			http.Error(w, `{"error":"share list failed"}`, http.StatusInternalServerError)
			return
		}
		share, ok := parsePendingAccountShareInvite(galleryID, workspaceID, id, token, permissionsJSON, createdAt)
		if ok {
			shares = append(shares, share)
		}
	}
	if err := pendingRows.Err(); err != nil {
		http.Error(w, `{"error":"share list failed"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"shares": shares})
}

func (h *GalleryHandler) createPendingAccountShareInvite(ctx context.Context, galleryID, ownerWorkspaceID uuid.UUID, email, storageBilledTo string, migrateStorageUsage bool) (galleryAccountShareResponse, error) {
	permissionsJSON, err := accountShareInvitePermissions(email, storageBilledTo, migrateStorageUsage)
	if err != nil {
		return galleryAccountShareResponse{}, err
	}
	inviteID := uuid.New()
	token := strings.ReplaceAll(uuid.NewString(), "-", "")

	var id uuid.UUID
	var savedToken string
	var savedPermissions []byte
	var createdAt time.Time
	err = h.pool.QueryRow(ctx,
		`WITH existing AS (
		   SELECT id
		     FROM share_links
		    WHERE gallery_id = $1
		      AND revoked_at IS NULL
		      AND permissions->>'account_share_invite' = 'true'
		      AND lower(permissions->>'pending_email') = lower($2)
		    ORDER BY created_at DESC
		    LIMIT 1
		 ),
		 updated AS (
		   UPDATE share_links
		      SET permissions = $3::jsonb
		    WHERE id = (SELECT id FROM existing)
		    RETURNING id, token, permissions, created_at
		 ),
		 inserted AS (
		   INSERT INTO share_links (id, gallery_id, token, permissions, download_allowed, access_count, created_at)
		   SELECT $4, $1, $5, $3::jsonb, FALSE, 0, NOW()
		    WHERE NOT EXISTS (SELECT 1 FROM updated)
		   RETURNING id, token, permissions, created_at
		 )
		 SELECT id, token, permissions, created_at FROM updated
		 UNION ALL
		 SELECT id, token, permissions, created_at FROM inserted
		 LIMIT 1`,
		galleryID,
		email,
		permissionsJSON,
		inviteID,
		token,
	).Scan(&id, &savedToken, &savedPermissions, &createdAt)
	if err != nil {
		return galleryAccountShareResponse{}, err
	}
	share, ok := parsePendingAccountShareInvite(galleryID, ownerWorkspaceID, id, savedToken, savedPermissions, createdAt)
	if !ok {
		return galleryAccountShareResponse{}, fmt.Errorf("invalid pending account share invite")
	}
	return share, nil
}

// CreateAccountShare handles POST /api/v1/galleries/{id}/account-shares.
func (h *GalleryHandler) CreateAccountShare(w http.ResponseWriter, r *http.Request) {
	if h.pool == nil {
		http.Error(w, `{"error":"account sharing unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	gallery, workspaceID, ok := h.requireGalleryInWorkspace(w, r, galleryID)
	if !ok {
		return
	}

	var input struct {
		Email               string `json:"email"`
		StorageBilledTo     string `json:"storage_billed_to"`
		MigrateStorageUsage bool   `json:"migrate_storage_usage"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if email == "" || !strings.Contains(email, "@") {
		http.Error(w, `{"error":"valid email required"}`, http.StatusBadRequest)
		return
	}
	storageBilledTo, err := normalizeStorageBilledTo(input.StorageBilledTo)
	if err != nil {
		http.Error(w, `{"error":"invalid storage_billed_to"}`, http.StatusBadRequest)
		return
	}
	actorID, _ := getUserID(r)

	var targetWorkspaceID uuid.UUID
	var targetWorkspaceName string
	err = h.pool.QueryRow(r.Context(),
		`SELECT w.id, COALESCE(w.name, '')
		   FROM users u
		   JOIN workspaces w ON w.owner_id = u.id
		    OR EXISTS (
		         SELECT 1
		           FROM workspace_members wm
		          WHERE wm.user_id = u.id
		            AND wm.workspace_id = w.id
		       )
		  WHERE lower(u.email) = lower($1)
		  ORDER BY CASE WHEN w.owner_id = u.id THEN 0 ELSE 1 END,
		           w.created_at ASC
		  LIMIT 1`,
		email,
	).Scan(&targetWorkspaceID, &targetWorkspaceName)
	if err == pgx.ErrNoRows {
		share, err := h.createPendingAccountShareInvite(r.Context(), galleryID, workspaceID, email, storageBilledTo, input.MigrateStorageUsage)
		if err != nil {
			log.Printf("gallery account pending invite create failed: gallery_id=%s owner_workspace_id=%s err=%v", galleryID, workspaceID, err)
			http.Error(w, `{"error":"pending invite failed"}`, http.StatusInternalServerError)
			return
		}
		respondJSON(w, http.StatusAccepted, share)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"target lookup failed"}`, http.StatusInternalServerError)
		return
	}
	if targetWorkspaceID == workspaceID {
		http.Error(w, `{"error":"cannot share gallery with owning account"}`, http.StatusBadRequest)
		return
	}

	storageBilledToWorkspaceID := workspaceID
	if storageBilledTo == "shared" {
		storageBilledToWorkspaceID = targetWorkspaceID
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		log.Printf("gallery account share begin failed: gallery_id=%s owner_workspace_id=%s target_workspace_id=%s err=%v", galleryID, workspaceID, targetWorkspaceID, err)
		http.Error(w, `{"error":"share failed"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context()) //nolint:errcheck

	var existingMigratedOriginal, existingMigratedDerivative int64
	var existingStorageBilledTo uuid.UUID
	err = tx.QueryRow(r.Context(),
		`SELECT storage_billed_to_workspace_id, migrated_original_bytes, migrated_derivative_bytes
		   FROM gallery_workspace_shares
		  WHERE gallery_id = $1
		    AND shared_workspace_id = $2
		    AND revoked_at IS NULL
		  FOR UPDATE`,
		galleryID, targetWorkspaceID,
	).Scan(&existingStorageBilledTo, &existingMigratedOriginal, &existingMigratedDerivative)
	if err != nil && err != pgx.ErrNoRows {
		log.Printf("gallery account share existing lookup failed: gallery_id=%s owner_workspace_id=%s target_workspace_id=%s err=%v", galleryID, workspaceID, targetWorkspaceID, err)
		http.Error(w, `{"error":"share failed"}`, http.StatusInternalServerError)
		return
	}

	share, err := scanGalleryAccountShare(tx.QueryRow(r.Context(),
		`WITH upserted AS (
		   INSERT INTO gallery_workspace_shares (
		     gallery_id, owner_workspace_id, shared_workspace_id,
		     storage_billed_to_workspace_id, migrate_storage_usage, shared_by_user_id
		   )
		   VALUES ($1, $2, $3, $4, $5, NULLIF($6::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
		   ON CONFLICT (gallery_id, shared_workspace_id) WHERE revoked_at IS NULL
		   DO UPDATE SET
		     storage_billed_to_workspace_id = EXCLUDED.storage_billed_to_workspace_id,
		     migrate_storage_usage = gallery_workspace_shares.migrate_storage_usage OR EXCLUDED.migrate_storage_usage,
		     shared_by_user_id = EXCLUDED.shared_by_user_id,
		     updated_at = NOW()
		   RETURNING *
		 )
		 `+galleryAccountShareSelectColumnsSQL+`
		 FROM upserted s`+galleryAccountShareSelectJoinsSQL,
		galleryID,
		workspaceID,
		targetWorkspaceID,
		storageBilledToWorkspaceID,
		input.MigrateStorageUsage,
		actorID,
	))
	if err != nil {
		log.Printf("gallery account share upsert failed: gallery_id=%s owner_workspace_id=%s target_workspace_id=%s err=%v", galleryID, workspaceID, targetWorkspaceID, err)
		http.Error(w, `{"error":"share failed"}`, http.StatusInternalServerError)
		return
	}

	if storageBilledTo == "shared" && input.MigrateStorageUsage && existingMigratedOriginal == 0 && existingMigratedDerivative == 0 {
		originalBytes, derivativeBytes, err := h.galleryStorageFootprint(r.Context(), tx, galleryID)
		if err != nil {
			http.Error(w, `{"error":"storage migration failed"}`, http.StatusInternalServerError)
			return
		}
		if err := h.moveWorkspaceStorageUsage(r.Context(), tx, workspaceID, targetWorkspaceID, originalBytes, derivativeBytes); err != nil {
			http.Error(w, `{"error":"storage migration failed"}`, http.StatusInternalServerError)
			return
		}
		share, err = scanGalleryAccountShare(tx.QueryRow(r.Context(),
			`WITH updated AS (
			   UPDATE gallery_workspace_shares
			      SET migrate_storage_usage = TRUE,
			          migrated_original_bytes = $2,
			          migrated_derivative_bytes = $3,
			          storage_migrated_at = NOW(),
			          updated_at = NOW()
			    WHERE id = $1
			    RETURNING *
			 )
			 `+galleryAccountShareSelectColumnsSQL+`
			 FROM updated s`+galleryAccountShareSelectJoinsSQL,
			share.ID,
			originalBytes,
			derivativeBytes,
		))
		if err != nil {
			http.Error(w, `{"error":"storage migration failed"}`, http.StatusInternalServerError)
			return
		}
	}

	if storageBilledTo == "owner" && (existingMigratedOriginal > 0 || existingMigratedDerivative > 0) {
		if err := h.moveWorkspaceStorageUsage(r.Context(), tx, targetWorkspaceID, workspaceID, existingMigratedOriginal, existingMigratedDerivative); err != nil {
			http.Error(w, `{"error":"storage migration failed"}`, http.StatusInternalServerError)
			return
		}
		share, err = scanGalleryAccountShare(tx.QueryRow(r.Context(),
			`WITH updated AS (
			   UPDATE gallery_workspace_shares
			      SET migrate_storage_usage = FALSE,
			          migrated_original_bytes = 0,
			          migrated_derivative_bytes = 0,
			          storage_migrated_at = NULL,
			          updated_at = NOW()
			    WHERE id = $1
			    RETURNING *
			 )
			 `+galleryAccountShareSelectColumnsSQL+`
			 FROM updated s`+galleryAccountShareSelectJoinsSQL,
			share.ID,
		))
		if err != nil {
			http.Error(w, `{"error":"storage migration failed"}`, http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Printf("gallery account share commit failed: gallery_id=%s owner_workspace_id=%s target_workspace_id=%s err=%v", galleryID, workspaceID, targetWorkspaceID, err)
		http.Error(w, `{"error":"share failed"}`, http.StatusInternalServerError)
		return
	}
	h.invalidateStorageAnalytics(gallery.WorkspaceID, targetWorkspaceID, existingStorageBilledTo, storageBilledToWorkspaceID)
	share.SharedUserEmail = email
	if share.SharedWorkspaceName == "" {
		share.SharedWorkspaceName = targetWorkspaceName
	}
	respondJSON(w, http.StatusOK, share)
}

// RevokeAccountShare handles DELETE /api/v1/galleries/{id}/account-shares/{shareId}.
func (h *GalleryHandler) RevokeAccountShare(w http.ResponseWriter, r *http.Request) {
	if h.pool == nil {
		http.Error(w, `{"error":"account sharing unavailable"}`, http.StatusServiceUnavailable)
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
	shareID, err := uuid.Parse(chi.URLParam(r, "shareId"))
	if err != nil {
		http.Error(w, `{"error":"invalid share id"}`, http.StatusBadRequest)
		return
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		http.Error(w, `{"error":"revoke failed"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context()) //nolint:errcheck

	var sharedWorkspaceID uuid.UUID
	var migratedOriginal, migratedDerivative int64
	err = tx.QueryRow(r.Context(),
		`SELECT shared_workspace_id, migrated_original_bytes, migrated_derivative_bytes
		   FROM gallery_workspace_shares
		  WHERE id = $1
		    AND gallery_id = $2
		    AND owner_workspace_id = $3
		    AND revoked_at IS NULL
		  FOR UPDATE`,
		shareID, galleryID, workspaceID,
	).Scan(&sharedWorkspaceID, &migratedOriginal, &migratedDerivative)
	if err == pgx.ErrNoRows {
		tag, revokeErr := tx.Exec(r.Context(),
			`UPDATE share_links
			    SET revoked_at = NOW()
			  WHERE id = $1
			    AND gallery_id = $2
			    AND revoked_at IS NULL
			    AND permissions->>'account_share_invite' = 'true'`,
			shareID,
			galleryID,
		)
		if revokeErr != nil {
			http.Error(w, `{"error":"revoke failed"}`, http.StatusInternalServerError)
			return
		}
		if tag.RowsAffected() == 0 {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			http.Error(w, `{"error":"revoke failed"}`, http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"revoke failed"}`, http.StatusInternalServerError)
		return
	}

	if migratedOriginal > 0 || migratedDerivative > 0 {
		if err := h.moveWorkspaceStorageUsage(r.Context(), tx, sharedWorkspaceID, workspaceID, migratedOriginal, migratedDerivative); err != nil {
			http.Error(w, `{"error":"storage migration failed"}`, http.StatusInternalServerError)
			return
		}
	}
	if _, err := tx.Exec(r.Context(),
		`UPDATE gallery_workspace_shares
		    SET revoked_at = NOW(),
		        updated_at = NOW()
		  WHERE id = $1`,
		shareID,
	); err != nil {
		http.Error(w, `{"error":"revoke failed"}`, http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, `{"error":"revoke failed"}`, http.StatusInternalServerError)
		return
	}
	h.invalidateStorageAnalytics(workspaceID, sharedWorkspaceID)
	w.WriteHeader(http.StatusNoContent)
}

// ListMediaKeys handles GET /api/v1/galleries/{id}/media-keys.
func (h *GalleryHandler) ListMediaKeys(w http.ResponseWriter, r *http.Request) {
	if h.mediaKeyRepo == nil {
		http.Error(w, `{"error":"gallery media key service unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	if _, _, ok := h.requireGalleryInWorkspace(w, r, id); !ok {
		return
	}

	keys, err := h.mediaKeyRepo.ListByGallery(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"media keys list failed"}`, http.StatusInternalServerError)
		return
	}

	response := make([]galleryMediaKeyResponse, 0, len(keys))
	for _, key := range keys {
		response = append(response, galleryMediaKeyResponse{
			KeyID:       key.KeyID,
			ExportedKey: key.ExportedKey,
		})
	}
	respondJSON(w, http.StatusOK, map[string]any{"keys": response})
}

// UpsertMediaKey handles PUT /api/v1/galleries/{id}/media-keys.
func (h *GalleryHandler) UpsertMediaKey(w http.ResponseWriter, r *http.Request) {
	if h.mediaKeyRepo == nil {
		http.Error(w, `{"error":"gallery media key service unavailable"}`, http.StatusServiceUnavailable)
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

	var input galleryMediaKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	keyID := strings.TrimSpace(input.KeyID)
	exportedKey := strings.TrimSpace(input.ExportedKey)
	if keyID == "" || exportedKey == "" {
		http.Error(w, `{"error":"key_id and exported_key are required"}`, http.StatusBadRequest)
		return
	}
	if strings.ContainsAny(exportedKey, " \t\r\n") {
		http.Error(w, `{"error":"exported_key must not contain whitespace"}`, http.StatusBadRequest)
		return
	}
	baseKeyID := "gallery:" + galleryID.String()
	if keyID != baseKeyID && !strings.HasPrefix(keyID, baseKeyID+":") {
		http.Error(w, `{"error":"key_id does not match gallery"}`, http.StatusBadRequest)
		return
	}

	userID, ok := getUserID(r)
	var updatedBy *uuid.UUID
	if ok && userID != uuid.Nil {
		updatedBy = &userID
	}
	key, err := h.mediaKeyRepo.Upsert(r.Context(), repository.GalleryMediaKey{
		GalleryID:   galleryID,
		KeyID:       keyID,
		ExportedKey: exportedKey,
		UpdatedBy:   updatedBy,
	})
	if err != nil {
		http.Error(w, `{"error":"media key save failed"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"key": galleryMediaKeyResponse{
			KeyID:       key.KeyID,
			ExportedKey: key.ExportedKey,
		},
	})
}

type galleryMediaKeyRequest struct {
	KeyID       string `json:"key_id"`
	ExportedKey string `json:"exported_key"`
}

type galleryMediaKeyResponse struct {
	KeyID       string `json:"key_id"`
	ExportedKey string `json:"exported_key"`
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
	if value, ok := raw["slideshow_interval_ms"]; ok {
		intervalMS, err := decodeGallerySlideshowIntervalMS(value)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
			return
		}
		if gallery.Settings == nil {
			gallery.Settings = map[string]interface{}{}
		}
		gallery.Settings["slideshow_interval_ms"] = intervalMS
	}
	if value, ok := raw["client_side_media_encryption_enabled"]; ok {
		var enabled bool
		if err := json.Unmarshal(value, &enabled); err != nil {
			http.Error(w, `{"error":"invalid client_side_media_encryption_enabled"}`, http.StatusBadRequest)
			return
		}
		if gallery.Settings == nil {
			gallery.Settings = map[string]interface{}{}
		}
		gallery.Settings["client_side_media_encryption_enabled"] = enabled
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
	} else {
		// Finish destructive gallery/asset cleanup even if the browser tab closes
		// after DELETE is accepted. Authorization still uses r.Context() above.
		deleteCtx := context.WithoutCancel(r.Context())
		if err := h.gallerySvc.SoftDeleteForWorkspace(deleteCtx, id, workspaceID); err != nil {
			http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
			return
		}
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
	if _, _, ok := h.requireGalleryReadable(w, r, galleryID); !ok {
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
	if _, _, ok := h.requireGalleryReadable(w, r, galleryID); !ok {
		return
	}

	assets, err := h.gallerySvc.ListAssets(r.Context(), galleryID)
	if err != nil {
		log.Printf("gallery list assets failed: gallery_id=%s err=%v", galleryID, err)
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
			log.Printf("gallery list assets enrich failed: gallery_id=%s err=%v", galleryID, err)
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
