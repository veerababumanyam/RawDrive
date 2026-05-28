package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// reservedSubdomainSlugs is the in-app list of labels we will not assign as a
// gallery subdomain_slug. The DB has its own CHECK constraint with the same
// set (migration 120) — this Go-side list lets the validator surface a clean
// error message before the INSERT, but the DB is the source of truth.
//
// Keeping both in sync is intentional: if someone tries to relax the Go list
// without also touching the migration, the constraint violation will fire and
// the bug will be obvious. If the migration list ever needs new entries, the
// follow-up migration must update this constant too.
var reservedSubdomainSlugs = map[string]struct{}{
	"www":      {},
	"api":      {},
	"app":      {},
	"admin":    {},
	"cdn":      {},
	"mail":     {},
	"ftp":      {},
	"static":   {},
	"assets":   {},
	"blog":     {},
	"docs":     {},
	"support":  {},
	"status":   {},
	"billing":  {},
	"payments": {},
	"auth":     {},
	"login":    {},
	"register": {},
	"mx":       {},
	"ns":       {},
	"cobolt":   {},
	"rawdrive": {},
	"localhost": {},
	"test":     {},
}

// ErrSubdomainSlugReserved is returned when a candidate slug matches a label
// we have explicitly reserved (api, www, etc.). Callers should retry with a
// different title (or accept a generated suffix).
var ErrSubdomainSlugReserved = errors.New("subdomain slug is reserved")

// ErrSubdomainSlugInvalid is returned when a candidate slug doesn't satisfy
// RFC 1035 single-label rules: 1-63 alphanumerics + hyphens, no leading or
// trailing hyphen, no consecutive hyphens.
var ErrSubdomainSlugInvalid = errors.New("subdomain slug is not a valid DNS label")

// maxSubdomainSlugCollisionRetries caps how many random-suffix retries
// GenerateUniqueSubdomainSlug will attempt before giving up. With 8 hex chars
// from a uuid (32^8 = ~1.1T values) collisions should never happen in
// practice, but a hard cap keeps the loop bounded.
const maxSubdomainSlugCollisionRetries = 5

// sanitizeForSubdomain takes a free-form title and produces a DNS-safe label.
// It mirrors the rules baked into the migration 120 CHECK constraints:
//   - lowercase
//   - strip everything that is not [a-z0-9-]
//   - collapse runs of hyphens to single hyphens
//   - trim leading and trailing hyphens
//   - truncate to maxLen
//
// This is the only place we encode the sanitization rules. The migration's
// regexp_replace + length check must agree with this function — if either
// changes, the other has to follow.
func sanitizeForSubdomain(title string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	lower := strings.ToLower(title)
	var b strings.Builder
	b.Grow(len(lower))
	prevHyphen := false
	for _, r := range lower {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			prevHyphen = false
		case r == '-' || r == ' ':
			// Coerce spaces to hyphens and collapse consecutive hyphens.
			if !prevHyphen && b.Len() > 0 {
				b.WriteByte('-')
				prevHyphen = true
			}
		default:
			// drop
		}
	}
	out := b.String()
	out = strings.TrimRight(out, "-") // drop trailing hyphen
	if len(out) > maxLen {
		out = strings.TrimRight(out[:maxLen], "-")
	}
	return out
}

// validateSubdomainSlug enforces RFC 1035 + the reserved list. Returns
// ErrSubdomainSlugInvalid or ErrSubdomainSlugReserved on failure, nil on pass.
// Length is bounded by the VARCHAR(63) column — anything longer is rejected
// before it reaches the DB so the error message is friendly.
func validateSubdomainSlug(slug string) error {
	if slug == "" {
		return fmt.Errorf("%w: empty", ErrSubdomainSlugInvalid)
	}
	if len(slug) > 63 {
		return fmt.Errorf("%w: exceeds 63 chars", ErrSubdomainSlugInvalid)
	}
	if _, ok := reservedSubdomainSlugs[slug]; ok {
		return fmt.Errorf("%w: %q", ErrSubdomainSlugReserved, slug)
	}
	// First and last must be alphanumeric.
	first := slug[0]
	last := slug[len(slug)-1]
	if !isLabelAlnum(first) || !isLabelAlnum(last) {
		return fmt.Errorf("%w: leading or trailing hyphen", ErrSubdomainSlugInvalid)
	}
	// Body must be [a-z0-9-] with no consecutive hyphens.
	var prevHyphen bool
	for i := 0; i < len(slug); i++ {
		c := slug[i]
		switch {
		case isLabelAlnum(c):
			prevHyphen = false
		case c == '-':
			if prevHyphen {
				return fmt.Errorf("%w: consecutive hyphens", ErrSubdomainSlugInvalid)
			}
			prevHyphen = true
		default:
			return fmt.Errorf("%w: char %q not allowed", ErrSubdomainSlugInvalid, c)
		}
	}
	return nil
}

func isLabelAlnum(c byte) bool {
	return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
}

// GenerateUniqueSubdomainSlug builds a candidate slug from `title`, appends a
// random suffix, and checks the DB for collisions (against subdomain_slug).
// Retries with a fresh suffix up to maxSubdomainSlugCollisionRetries times if
// the candidate is already taken. The final returned value is guaranteed:
//   - to satisfy the RFC 1035 / reserved-list rules
//   - to fit in 63 chars
//   - to not exist in the galleries table at the time of the call
//
// Caller may still race with another concurrent INSERT; the DB's UNIQUE index
// on subdomain_slug is the ultimate guard.
func (r *GalleryRepo) GenerateUniqueSubdomainSlug(ctx context.Context, title string) (string, error) {
	// 63 (column max) - 1 (hyphen) - 8 (suffix) = 54 chars for the title body.
	const suffixLen = 8
	const bodyMax = 63 - 1 - suffixLen

	base := sanitizeForSubdomain(title, bodyMax)
	// If sanitization left an empty body (title was all punctuation, or empty),
	// use a stable filler so the result still satisfies the validator.
	if base == "" {
		base = "gallery"
	}
	// If the sanitized body happens to be a reserved label, prefix it so we
	// never produce e.g. "api-<suffix>" — actually that's fine because the
	// final form has a suffix, which makes it != "api". The reserved check
	// runs against the FULL final slug.

	for attempt := 0; attempt < maxSubdomainSlugCollisionRetries; attempt++ {
		suffix := strings.ReplaceAll(uuid.New().String(), "-", "")[:suffixLen]
		candidate := base + "-" + suffix
		if err := validateSubdomainSlug(candidate); err != nil {
			// Should be impossible given sanitization + alphanumeric suffix.
			// Fall through to next attempt rather than panic; logs will surface
			// the loop if it ever happens in practice.
			continue
		}
		taken, err := r.subdomainSlugExists(ctx, candidate)
		if err != nil {
			return "", fmt.Errorf("subdomain slug uniqueness check: %w", err)
		}
		if !taken {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("could not generate unique subdomain_slug after %d attempts", maxSubdomainSlugCollisionRetries)
}

func (r *GalleryRepo) subdomainSlugExists(ctx context.Context, slug string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM galleries WHERE subdomain_slug = $1 AND deleted_at IS NULL)`,
		slug,
	).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
}

// GetBySubdomainSlug retrieves a gallery by its subdomain_slug column.
// Mirrors GetBySlug's SELECT shape exactly so callers can swap which lookup
// they want without losing fields.
func (r *GalleryRepo) GetBySubdomainSlug(ctx context.Context, slug string) (*Gallery, error) {
	g := &Gallery{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, workspace_id, contact_id, primary_contact_id, project_id, event_id, deal_id, invoice_id,
		 title, slug, subdomain_slug, description, cover_asset_id, gallery_type,
		 settings, password_hash, watermark_config, is_published, max_selections, status,
		 created_by, created_at, updated_at, published_at, archived_at, deleted_at,
		 cover_template, cover_config, expires_at, download_enabled, sort_preference, whatsapp_template,
		 faceid_enabled, face_detection_enabled
		 FROM galleries WHERE subdomain_slug = $1 AND deleted_at IS NULL`, slug,
	).Scan(&g.ID, &g.WorkspaceID, &g.ContactID, &g.PrimaryContactID, &g.ProjectID, &g.EventID, &g.DealID, &g.InvoiceID,
		&g.Title, &g.Slug, &g.SubdomainSlug, &g.Description, &g.CoverAssetID,
		&g.GalleryType, &g.Settings, &g.PasswordHash, &g.WatermarkConfig, &g.IsPublished,
		&g.MaxSelections, &g.Status, &g.CreatedBy, &g.CreatedAt, &g.UpdatedAt, &g.PublishedAt, &g.ArchivedAt, &g.DeletedAt,
		&g.CoverTemplate, &g.CoverConfig, &g.ExpiresAt, &g.DownloadEnabled, &g.SortPreference, &g.WhatsappTemplate,
		&g.FaceIDEnabled, &g.FaceDetectionEnabled,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("gallery repo get by subdomain_slug: %w", err)
	}
	g.normalizeWorkspaceLinks()
	return g, nil
}

// unused import guard — uuid is used by GenerateUniqueSubdomainSlug above.
// (Without this, gofmt-tools may complain about uuid not being used if the
// only reference is in a generic-typed function. It is genuinely used.)
var _ = uuid.Nil

// GetBySlugScopedByBusinessCode resolves a gallery via a JOIN through the
// workspace's business_unique_code. This is the lookup path used by the
// per-business subdomain feature (migration 121):
//
//   <business_profile_slug>-<business_unique_code>.rawdrive.in/<gallery.slug>
//
// The nginx wildcard server block forwards `<biz>-<code>` as the Host header;
// the public gallery handler extracts <code> (last 8 chars), and this method
// scopes the slug lookup to that workspace's galleries. Workspace lookup +
// gallery lookup happen in a single SQL round-trip via the JOIN, hitting
// idx_workspaces_business_unique_code (UNIQUE) and idx_galleries_workspace_slug
// (UNIQUE, composite). Returns nil, nil for either workspace-not-found or
// slug-not-found-in-that-workspace — callers handle 404 the same way.
func (r *GalleryRepo) GetBySlugScopedByBusinessCode(ctx context.Context, businessCode, slug string) (*Gallery, error) {
	g := &Gallery{}
	err := r.pool.QueryRow(ctx,
		`SELECT g.id, g.workspace_id, g.contact_id, g.primary_contact_id, g.project_id, g.event_id, g.deal_id, g.invoice_id,
		 g.title, g.slug, g.subdomain_slug, g.description, g.cover_asset_id, g.gallery_type,
		 g.settings, g.password_hash, g.watermark_config, g.is_published, g.max_selections, g.status,
		 g.created_by, g.created_at, g.updated_at, g.published_at, g.archived_at, g.deleted_at,
		 g.cover_template, g.cover_config, g.expires_at, g.download_enabled, g.sort_preference, g.whatsapp_template,
		 g.faceid_enabled, g.face_detection_enabled
		 FROM galleries g
		 INNER JOIN workspaces w ON w.id = g.workspace_id
		 WHERE w.business_unique_code = $1
		   AND g.slug = $2
		   AND g.deleted_at IS NULL
		   AND w.deleted_at IS NULL`,
		businessCode, slug,
	).Scan(&g.ID, &g.WorkspaceID, &g.ContactID, &g.PrimaryContactID, &g.ProjectID, &g.EventID, &g.DealID, &g.InvoiceID,
		&g.Title, &g.Slug, &g.SubdomainSlug, &g.Description, &g.CoverAssetID,
		&g.GalleryType, &g.Settings, &g.PasswordHash, &g.WatermarkConfig, &g.IsPublished,
		&g.MaxSelections, &g.Status, &g.CreatedBy, &g.CreatedAt, &g.UpdatedAt, &g.PublishedAt, &g.ArchivedAt, &g.DeletedAt,
		&g.CoverTemplate, &g.CoverConfig, &g.ExpiresAt, &g.DownloadEnabled, &g.SortPreference, &g.WhatsappTemplate,
		&g.FaceIDEnabled, &g.FaceDetectionEnabled,
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
