package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// GetBySlugScopedByBusinessCode resolves a gallery via a JOIN through the
// workspace's business_unique_code. This supports deprecated/internal
// migration-121 workspace scope tokens; generated public gallery URLs use the
// canonical apex path, https://rawdrive.in/g/<slug>. Workspace lookup +
// gallery lookup happen in a single SQL round-trip via the JOIN, hitting
// idx_workspaces_business_unique_code (UNIQUE) and idx_galleries_workspace_slug
// (UNIQUE, composite). Returns nil, nil for either workspace-not-found or
// slug-not-found-in-that-workspace — callers handle 404 the same way.
func (r *GalleryRepo) GetBySlugScopedByBusinessCode(ctx context.Context, businessCode, slug string) (*Gallery, error) {
	g := &Gallery{}
	err := r.pool.QueryRow(ctx,
		`SELECT g.id, g.workspace_id, g.contact_id, g.primary_contact_id, g.project_id, g.event_id, g.deal_id, g.invoice_id,
		 g.title, g.slug, g.description, g.cover_asset_id, g.gallery_type,
		 g.settings, g.password_hash, g.watermark_config, g.is_published, g.max_selections, g.status,
		 g.created_by, g.created_at, g.updated_at, g.published_at, g.archived_at, g.deleted_at,
		 g.cover_template, g.cover_config, g.expires_at, g.download_enabled, COALESCE(g.download_quality, 'webp'), g.sort_preference, g.whatsapp_template,
		 g.faceid_enabled, g.face_detection_enabled, COALESCE(g.access_mode, 'private'),
		 g.music_asset_id, g.email_automation_enabled
		 FROM galleries g
		 INNER JOIN workspaces w ON w.id = g.workspace_id
		 WHERE w.business_unique_code = $1
		   AND g.slug = $2
		   AND g.deleted_at IS NULL
		   AND w.deleted_at IS NULL`,
		businessCode, slug,
	).Scan(&g.ID, &g.WorkspaceID, &g.ContactID, &g.PrimaryContactID, &g.ProjectID, &g.EventID, &g.DealID, &g.InvoiceID,
		&g.Title, &g.Slug, &g.Description, &g.CoverAssetID,
		&g.GalleryType, &g.Settings, &g.PasswordHash, &g.WatermarkConfig, &g.IsPublished,
		&g.MaxSelections, &g.Status, &g.CreatedBy, &g.CreatedAt, &g.UpdatedAt, &g.PublishedAt, &g.ArchivedAt, &g.DeletedAt,
		&g.CoverTemplate, &g.CoverConfig, &g.ExpiresAt, &g.DownloadEnabled, &g.DownloadQuality, &g.SortPreference, &g.WhatsappTemplate,
		&g.FaceIDEnabled, &g.FaceDetectionEnabled, &g.AccessMode,
		&g.MusicAssetID, &g.EmailAutomationEnabled,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("gallery repo get by business+slug: %w", err)
	}
	g.normalizeWorkspaceLinks()
	return g, nil
}
