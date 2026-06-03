package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/ai"
	"github.com/rawdrive/backend/internal/face"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// PublicGalleryHandler handles public gallery viewing (no auth).
type PublicGalleryHandler struct {
	gallerySvc publicGalleryResolver
	assetSvc   *service.AssetService
	shareSvc   *service.ShareLinkService
	albumSvc   *service.AlbumService
	accessSvc  *service.GalleryAccessService

	// M13 deferred-FR closure deps (optional — nil-safe handlers degrade
	// gracefully so existing tests that construct PublicGalleryHandler
	// without these continue to compile).
	pool       *pgxpool.Pool // subscription tier lookup for GAL-FR-115
	faceRepo   *ai.FaceRepo  // gallery-scoped face match for GAL-FR-107/108
	faceClient *face.Client  // optional face-svc client for server-side
	// detect+embed on the public Photo Search endpoint. Nil when
	// FACE_SVC_URL is unset — the endpoint returns 503 in that case
	// rather than throwing the request away silently.

	// 2026-05-18: watermark baking for the public download path. Optional —
	// when nil, PublicAssetDownload streams the raw original. When set and
	// the gallery's watermark_config is enabled, the original is decoded,
	// watermarked, and re-encoded as JPEG before being streamed.
	watermarkSvc *service.WatermarkService

	// F-029: bulk asset lookup for the public list endpoints. Optional and
	// nil-safe — when set (production wires it from the same pool injected via
	// WithM13Deps) ListAssets/ListAlbumAssets fetch every asset for the gallery
	// in a single `id = ANY($1)` query instead of one GetByID per junction row.
	// When nil (e.g. tests that construct the handler without a pool) the
	// enrichment path degrades to the previous per-ID lookups, so behaviour is
	// unchanged for callers that never wired a batch source.
	assetBatch publicAssetBatchSource

	// shareSession is the narrow seam tryBindShareSession (S4-G2) uses to
	// validate + commit a share link. Defaults to the concrete shareSvc; a test
	// can override it via WithShareSessionSource to assert expired/wrong-PIN/
	// exhausted links yield no session.
	shareSession shareSessionSource
}

type publicGalleryResolver interface {
	GetBySlug(ctx context.Context, slug string) (*repository.Gallery, error)
	GetByBusinessSubdomainAndSlug(ctx context.Context, subdomain, slug string) (*repository.Gallery, error)
	ListAssets(ctx context.Context, galleryID uuid.UUID) ([]repository.GalleryAsset, error)
}

// shareSessionSource is the subset of ShareLinkService the public handler needs
// to bind a verified share link to a durable gallery session (S4-G2):
//   - GalleryIDForToken: confirm the token is bound to THIS gallery.
//   - ValidateAccess: authoritative expiry + PIN + max_access_count pre-flight.
//   - TrackAccess: atomically commit the access (enforces the cap concurrently).
type shareSessionSource interface {
	GalleryIDForToken(ctx context.Context, token string) (uuid.UUID, error)
	ValidateAccess(ctx context.Context, token, credential string) (bool, error)
	TrackAccess(ctx context.Context, token string) (int, error)
}

// publicAssetBatchSource is the narrow bulk-read seam the public list
// endpoints use to collapse the per-asset N+1 (F-029) into one query. Defining
// it locally keeps the handler testable with an in-memory fake while
// production wires the pool-backed poolAssetBatchSource.
type publicAssetBatchSource interface {
	// GetByIDs fetches every live (non-soft-deleted) asset whose ID is in the
	// set with a single query. Missing IDs are simply absent from the result;
	// order is not guaranteed (callers index by ID).
	GetByIDs(ctx context.Context, ids []uuid.UUID) ([]*repository.Asset, error)
}

// poolAssetBatchSource is the production publicAssetBatchSource: a thin wrapper
// over the request pool that issues the bulk `id = ANY($1)` query. The column
// list mirrors AssetRepo.GetByID so the enriched response carries the same
// fields the per-ID path produced.
type poolAssetBatchSource struct {
	pool *pgxpool.Pool
}

func (s poolAssetBatchSource) GetByIDs(ctx context.Context, ids []uuid.UUID) ([]*repository.Asset, error) {
	if s.pool == nil || len(ids) == 0 {
		return nil, nil
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id, workspace_id, filename, content_type, size_bytes, storage_key,
		 storage_driver, width, height, blurhash, exif_data, thumbnail_urls, uploaded_by,
		 status, processing_error, created_at, updated_at, deleted_at,
		 is_encrypted, encryption_algo, encryption_version, media_encryption
		 FROM assets WHERE id = ANY($1) AND deleted_at IS NULL`, ids,
	)
	if err != nil {
		return nil, fmt.Errorf("public gallery: bulk get assets: %w", err)
	}
	defer rows.Close()

	var assets []*repository.Asset
	for rows.Next() {
		a := &repository.Asset{}
		if err := rows.Scan(&a.ID, &a.WorkspaceID, &a.Filename, &a.ContentType, &a.SizeBytes,
			&a.StorageKey, &a.StorageDriver, &a.Width, &a.Height, &a.Blurhash, &a.ExifData,
			&a.ThumbnailURLs, &a.UploadedBy, &a.Status, &a.ProcessingError, &a.CreatedAt, &a.UpdatedAt, &a.DeletedAt,
			&a.IsEncrypted, &a.EncryptionAlgo, &a.EncryptionVersion, &a.MediaEncryption,
		); err != nil {
			return nil, fmt.Errorf("public gallery: bulk get assets scan: %w", err)
		}
		assets = append(assets, a)
	}
	return assets, rows.Err()
}

func NewPublicGalleryHandler(gs publicGalleryResolver, as *service.AssetService, ss *service.ShareLinkService) *PublicGalleryHandler {
	h := &PublicGalleryHandler{gallerySvc: gs, assetSvc: as, shareSvc: ss}
	// Default the share-session seam to the concrete service. A nil *ShareLinkService
	// stored in an interface is still non-nil, so tryBindShareSession guards on
	// the underlying shareSvc being nil before invoking it.
	if ss != nil {
		h.shareSession = ss
	}
	return h
}

// WithShareSessionSource overrides the share-link seam tryBindShareSession uses
// (S4-G2). Primarily a test seam so expired/wrong-PIN/exhausted share links can
// be exercised without a DB; production uses the concrete ShareLinkService.
func (h *PublicGalleryHandler) WithShareSessionSource(src shareSessionSource) *PublicGalleryHandler {
	h.shareSession = src
	return h
}

// WithWatermarkService wires the optional watermark baker used by
// PublicAssetDownload. Returns the receiver for chained construction.
func (h *PublicGalleryHandler) WithWatermarkService(ws *service.WatermarkService) *PublicGalleryHandler {
	h.watermarkSvc = ws
	return h
}

// WithM13Deps injects the M13 deferred-FR closure dependencies (pool + face
// repo). Call after construction when wiring routes_m2. Returns the receiver
// so callers can chain.
func (h *PublicGalleryHandler) WithM13Deps(pool *pgxpool.Pool, faceRepo *ai.FaceRepo) *PublicGalleryHandler {
	h.pool = pool
	h.faceRepo = faceRepo
	// F-029: the same pool backs the bulk asset lookup used by ListAssets /
	// ListAlbumAssets. Wiring it here means production (which always passes a
	// non-nil pool) gets the single-query path automatically, while handlers
	// constructed without M13 deps keep the per-ID fallback.
	if pool != nil {
		h.assetBatch = poolAssetBatchSource{pool: pool}
	}
	return h
}

// WithAssetBatchSource overrides the bulk asset lookup used by the public list
// endpoints (F-029). Primarily a test seam so the N+1 collapse can be verified
// against an in-memory fake; production wires the pool-backed source via
// WithM13Deps. Returns the receiver for chained construction.
func (h *PublicGalleryHandler) WithAssetBatchSource(src publicAssetBatchSource) *PublicGalleryHandler {
	h.assetBatch = src
	return h
}

// WithAlbumService wires album lookups for public sub-gallery links.
func (h *PublicGalleryHandler) WithAlbumService(albumSvc *service.AlbumService) *PublicGalleryHandler {
	h.albumSvc = albumSvc
	return h
}

func (h *PublicGalleryHandler) WithGalleryAccessService(accessSvc *service.GalleryAccessService) *PublicGalleryHandler {
	h.accessSvc = accessSvc
	return h
}

// gallerySessionToken pulls the DURABLE gallery-session token off the request
// from the header (fetch callers) or the cookie (browser). It deliberately does
// NOT read the token from the URL query string: the durable session is a
// long-lived, multi-purpose credential and putting it in a URL leaks it into
// access logs, browser history, and the Referer header (SEC-1, security audit
// 2026-05-30). Header-less byte/media loads use the short-lived ?at=
// asset-access token instead (see hasValidGallerySession). Empty when neither
// header nor cookie is present.
func gallerySessionToken(r *http.Request) string {
	if t := r.Header.Get("X-Gallery-Session"); t != "" {
		return t
	}
	if c, err := r.Cookie("gallery_session"); err == nil {
		return c.Value
	}
	return ""
}

// hasValidGallerySession reports whether the request is authorized for this
// gallery (password- or share-scoped) on ANY node (S4-G4/E). It accepts either:
//
//   - the DURABLE session from the X-Gallery-Session header or the
//     SameSite=Strict gallery_session cookie (JSON fetch / same-origin), or
//   - a short-lived, gallery-scoped, HMAC-signed asset-access token in ?at= for
//     header-less <img>/<audio> media URLs that, in a split-origin deploy, can
//     carry neither header nor cookie. The ?at= token uses a DISTINCT JWT
//     audience so it can never be replayed as a session, and is only ever minted
//     for a client that already proved access (see GetBySlug) — so it cannot
//     bypass the gate (SEC-1).
func (h *PublicGalleryHandler) hasValidGallerySession(r *http.Request, gallery *repository.Gallery) bool {
	if h.accessSvc == nil || gallery == nil {
		return false
	}
	if tok := gallerySessionToken(r); tok != "" &&
		h.accessSvc.ValidateSession(r.Context(), gallery.ID, tok) {
		return true
	}
	if at := r.URL.Query().Get("at"); at != "" {
		if gid, ok := h.accessSvc.GalleryIDFromAssetToken(r.Context(), at); ok && gid == gallery.ID {
			return true
		}
	}
	return false
}

// tryBindShareSession handles the share-link first-touch (S4-G2). When the
// request carries ?share=<token> for THIS gallery, it runs the authoritative
// ShareLinkService.ValidateAccess (expiry + PIN + max_access_count) and, on
// success, atomically commits the access via TrackAccess, mints a durable
// share-scoped gallery session, and writes it as the gallery_session cookie so
// subsequent asset/album/byte requests carry it. Returns true only when a valid
// share session was established. An expired / wrong-PIN / exhausted link yields
// false (and never mints a session), so it cannot unlock the gallery.
//
// The optional ?share_pin / ?pin query param (or X-Share-PIN header) supplies
// the PIN credential without a separate verify round-trip; the dedicated
// POST /share/{token}/verify endpoint remains for clients that prefer it.
func (h *PublicGalleryHandler) tryBindShareSession(w http.ResponseWriter, r *http.Request, gallery *repository.Gallery) bool {
	if h.shareSession == nil || h.accessSvc == nil || gallery == nil {
		return false
	}
	token := r.URL.Query().Get("share")
	if token == "" {
		token = r.Header.Get("X-Share-Token")
	}
	if token == "" {
		return false
	}

	// Bind the share token to THIS gallery — a share token for gallery A must
	// never unlock gallery B even if the slug is swapped in the URL (S4-G2).
	boundGallery, err := h.shareSession.GalleryIDForToken(r.Context(), token)
	if err != nil || boundGallery != gallery.ID {
		return false
	}

	credential := r.URL.Query().Get("share_pin")
	if credential == "" {
		credential = r.URL.Query().Get("pin")
	}
	if credential == "" {
		credential = r.Header.Get("X-Share-PIN")
	}

	// Authoritative gate: expiry, PIN/email credential, and max_access_count
	// pre-flight all live in ValidateAccess.
	ok, err := h.shareSession.ValidateAccess(r.Context(), token, credential)
	if err != nil || !ok {
		return false
	}
	// Commit the access atomically (enforces max_access_count under concurrency).
	if _, err := h.shareSession.TrackAccess(r.Context(), token); err != nil {
		return false
	}

	sessionToken, err := h.accessSvc.IssueShareSession(gallery.ID, token)
	if err != nil {
		return false
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "gallery_session",
		Value:    sessionToken,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   true,
		MaxAge:   86400,
	})
	// Surface the freshly-minted token to non-browser callers via a response
	// header so they can attach X-Gallery-Session on follow-up requests.
	w.Header().Set("X-Gallery-Session", sessionToken)
	return true
}

// gateGalleryAccess is the single authorization gate for every public gallery
// read surface that serves gallery content (slug listings, album listings,
// downloads) and the storage byte path (via main.go). It closes the
// "public delivery is not actually gated" cluster from the 2026-05-31
// integration audit:
//
//   - S4-G3: enforces access_mode server-side. 'private'/'invite-only' require
//     a verified share-link/invite session; 'unlisted' & 'public' are reachable
//     by direct slug (unlisted is just excluded from discovery surfaces, which
//     this handler never exposes anyway).
//   - S4-G1/G2: a password-protected gallery requires a valid password session;
//     a gallery reached via a share link requires a valid (non-expired, correct
//     PIN, non-exhausted) share session. Both are the SAME durable session
//     primitive (S4-G4/E) so every node agrees.
//
// CRITICAL CONSTRAINT (regression guard): a published, non-expired, non-password
// gallery whose access_mode is 'public' or 'unlisted' MUST still serve to
// anonymous clients — that is the normal delivery case. Only password / share /
// private galleries are gated.
//
// Returns true when the request may proceed. On denial it has already written
// the response (404 for unpublished/expired/not-found-shape, 401/403 for
// missing session) and returns false.
func (h *PublicGalleryHandler) gateGalleryAccess(w http.ResponseWriter, r *http.Request, gallery *repository.Gallery) bool {
	if gallery == nil {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return false
	}
	if !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return false
	}
	if gallery.ExpiresAt != nil && gallery.ExpiresAt.Before(time.Now().UTC()) {
		http.Error(w, `{"error":"gallery expired"}`, http.StatusGone)
		return false
	}

	// First-touch share link: validate + bind a durable share session.
	hasShareSession := h.tryBindShareSession(w, r, gallery)
	// Existing session (password- or share-scoped) presented on the request.
	hasSession := hasShareSession || h.hasValidGallerySession(r, gallery)

	passwordProtected := gallery.PasswordHash != nil && *gallery.PasswordHash != ""
	mode := strings.ToLower(strings.TrimSpace(gallery.AccessMode))

	// S4-G3: private / invite-only galleries are NEVER served without a
	// verified session, regardless of password state.
	if mode == "private" || mode == "invite-only" {
		if hasSession {
			return true
		}
		http.Error(w, `{"error":"gallery access requires a valid share link or invite"}`, http.StatusForbidden)
		return false
	}

	// S4-G1/G2: password-protected public/unlisted galleries require a session.
	if passwordProtected {
		if hasSession {
			return true
		}
		http.Error(w, `{"error":"gallery password required"}`, http.StatusUnauthorized)
		return false
	}

	// Normal delivery case: published, non-expired, non-password,
	// public/unlisted (or legacy empty mode) — anonymous access allowed.
	return true
}

// requirePublicGallerySession is retained as a thin alias over gateGalleryAccess
// for call sites that already verified published/expiry upstream; it now applies
// the full access_mode + password + share gate (S4-G1/G2/G3). Callers that pass
// a gallery already known to be published get the same answer.
func (h *PublicGalleryHandler) requirePublicGallerySession(w http.ResponseWriter, r *http.Request, gallery *repository.Gallery) bool {
	return h.gateGalleryAccess(w, r, gallery)
}

// WithFaceClient enables the public Photo Search endpoint. Nil-safe:
// the endpoint returns 503 if invoked without a client wired (e.g.
// FACE_SVC_URL not set in the deployment). Setter mirrors the
// FaceService.WithFaceClient pattern used by the dashboard side.
func (h *PublicGalleryHandler) WithFaceClient(c *face.Client) *PublicGalleryHandler {
	h.faceClient = c
	return h
}

// extractWorkspaceSubdomain reads the per-business subdomain (migration 121
// shape: <biz-slug>-<biz-code>) from the request. Two sources, checked in
// priority order:
//
//  1. `?ws=` query parameter — set by the Next.js middleware when it rewrites
//     <sub>.rawdrive.in/<slug> to /g/<slug>?ws=<sub> before passing the
//     request to the API server.
//  2. `X-Workspace-Subdomain` header — fallback for direct API callers
//     (curl, future native apps) that prefer headers to querystrings.
//
// Returns "" when neither is present. The caller decides whether to scope
// the gallery lookup to a workspace or fall back to the unscoped legacy path.
func resolveWorkspaceSubdomain(r *http.Request) string {
	if sub := r.URL.Query().Get("ws"); sub != "" {
		return sub
	}
	return r.Header.Get("X-Workspace-Subdomain")
}

// resolveGalleryForRequest looks up the gallery for a public request.
//
// Scoping rules (security-critical — see CVE-style note below):
//
//   - When `?ws=<biz>-<code>` is provided, the lookup is STRICTLY scoped to
//     that workspace. A miss returns nil (caller renders 404). We do NOT
//     fall back to unscoped lookup in this case — doing so would let a
//     request to `<bizA>.rawdrive.in/<slug-belonging-to-bizB>` resolve to
//     bizB's gallery, breaking the workspace isolation guarantee that the
//     subdomain URL implicitly promises.
//
//   - When no `?ws=` is provided (legacy `/g/<slug>` apex paths), use the
//     unscoped GalleryService.GetBySlug. Works because slugs include an
//     8-char UUID suffix and are unique in practice. Keeps the legacy
//     `https://rawdrive.in/g/<slug>` URL pattern working.
//
// Original implementation fell back to unscoped lookup on scoped miss, which
// surfaced as a HTTP-200 on `?ws=fake-studio-deadbeef` against a real slug
// during post-deploy verification 2026-05-28. Fixed in same session.
func (h *PublicGalleryHandler) resolveGalleryForRequest(r *http.Request, slug string) (*repository.Gallery, error) {
	if sub := resolveWorkspaceSubdomain(r); sub != "" {
		// Strict scoping — a miss is a miss. Returning nil here causes the
		// caller to send 404 to the client, which is the only correct answer
		// when the requested workspace doesn't own the requested slug.
		return h.gallerySvc.GetByBusinessSubdomainAndSlug(r.Context(), sub, slug)
	}
	// No workspace context (apex `/g/<slug>` path) — fall through to the
	// legacy unscoped lookup chain.
	return h.gallerySvc.GetBySlug(r.Context(), slug)
}

type publicStudioProfileResponse struct {
	ID                    string  `json:"id"`
	Name                  string  `json:"name"`
	DisplayName           string  `json:"display_name"`
	BrandName             string  `json:"brand_name,omitempty"`
	BrandAccentColor      string  `json:"brand_accent_color,omitempty"`
	PublicBrandingEnabled bool    `json:"public_branding_enabled"`
	CanCustomize          bool    `json:"can_customize"`
	TierSlug              string  `json:"tier_slug"`
	AddressLine1          string  `json:"address_line1,omitempty"`
	AddressLine2          string  `json:"address_line2,omitempty"`
	City                  string  `json:"city,omitempty"`
	PostalCode            string  `json:"postal_code,omitempty"`
	Phone                 string  `json:"phone,omitempty"`
	Email                 string  `json:"email,omitempty"`
	Website               string  `json:"website,omitempty"`
	LogoURL               *string `json:"logo_url,omitempty"`
	BusinessProfileSlug   string  `json:"business_profile_slug"`
	BusinessUniqueCode    string  `json:"business_unique_code"`
	BusinessSubdomain     string  `json:"business_subdomain"`
	PublicURL             string  `json:"public_url"`
}

type publicStudioGalleryResponse struct {
	ID              string            `json:"id"`
	Title           string            `json:"title"`
	Slug            string            `json:"slug"`
	Description     string            `json:"description"`
	GalleryType     string            `json:"gallery_type"`
	CoverThumbnails map[string]string `json:"cover_thumbnails,omitempty"`
	CreatedAt       time.Time         `json:"created_at"`
	PublishedAt     *time.Time        `json:"published_at,omitempty"`
	DownloadEnabled bool              `json:"download_enabled"`
	PublicURL       string            `json:"public_url"`
}

type publicStudioLandingResponse struct {
	Studio    publicStudioProfileResponse   `json:"studio"`
	Galleries []publicStudioGalleryResponse `json:"galleries"`
	Counts    map[string]int                `json:"counts"`
}

func publicStudioBusinessCodeFromSubdomain(subdomain string) string {
	if len(subdomain) < 10 {
		return ""
	}
	dash := len(subdomain) - 9
	if subdomain[dash] != '-' {
		return ""
	}
	code := subdomain[dash+1:]
	if len(code) != 8 {
		return ""
	}
	for i := 0; i < len(code); i++ {
		c := code[i]
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
			return ""
		}
	}
	return code
}

func publicStudioSubdomainURL(subdomain string) string {
	return "https://" + subdomain + ".rawdrive.in"
}

const publicStudioSafeGalleryPredicate = `
		  AND (g.password_hash IS NULL OR g.password_hash = '')
		  AND LOWER(COALESCE(NULLIF(BTRIM(g.access_mode), ''), 'private')) = 'public'`

// GetStudioLanding handles GET /api/v1/public/studios/{subdomain}.
// It exposes public-safe business profile fields plus published gallery cards
// for the workspace encoded in `<business_profile_slug>-<business_unique_code>`.
// It never returns workspace bank/tax fields, gallery settings, password
// hashes, storage keys, or unpublished galleries.
func (h *PublicGalleryHandler) GetStudioLanding(w http.ResponseWriter, r *http.Request) {
	subdomain := strings.ToLower(strings.TrimSpace(chi.URLParam(r, "subdomain")))
	code := publicStudioBusinessCodeFromSubdomain(subdomain)
	if code == "" {
		http.Error(w, `{"error":"invalid studio subdomain"}`, http.StatusBadRequest)
		return
	}
	if h.pool == nil {
		http.Error(w, `{"error":"studio landing unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	var (
		workspaceID                                          uuid.UUID
		name, address1, address2, city, postal, phone, email string
		website, brandName, accent, logoAssetID              string
		publicBranding                                       bool
		businessSlug, businessCode                           string
	)
	err := h.pool.QueryRow(r.Context(), `
		SELECT
			id,
			COALESCE(name, ''),
			COALESCE(address_line1, ''),
			COALESCE(address_line2, ''),
			COALESCE(city, ''),
			COALESCE(postal_code, ''),
			COALESCE(phone, ''),
			COALESCE(email, ''),
			COALESCE(website, ''),
			COALESCE(brand_name, ''),
			COALESCE(brand_accent_color, ''),
			COALESCE(public_branding_enabled, true),
			COALESCE(logo_asset_id::text, ''),
			COALESCE(business_profile_slug, ''),
			COALESCE(business_unique_code, '')
		FROM workspaces
		WHERE business_unique_code = $1
		  AND deleted_at IS NULL
		LIMIT 1`,
		code,
	).Scan(
		&workspaceID,
		&name,
		&address1,
		&address2,
		&city,
		&postal,
		&phone,
		&email,
		&website,
		&brandName,
		&accent,
		&publicBranding,
		&logoAssetID,
		&businessSlug,
		&businessCode,
	)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"studio not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to load studio"}`, http.StatusInternalServerError)
		return
	}

	tier := h.lookupWorkspaceTier(r.Context(), workspaceID)
	canCustomize := canCustomizeForTier(tier) && publicBranding
	displayName := strings.TrimSpace(name)
	if canCustomize && strings.TrimSpace(brandName) != "" {
		displayName = strings.TrimSpace(brandName)
	}
	if displayName == "" {
		displayName = "Studio"
	}

	var logoURL *string
	if canCustomize && logoAssetID != "" {
		url := "/api/v1/public/studios/" + subdomain + "/logo"
		logoURL = &url
	}

	galleries, err := h.listPublishedStudioGalleries(r.Context(), workspaceID, subdomain)
	if err != nil {
		http.Error(w, `{"error":"failed to load studio galleries"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, publicStudioLandingResponse{
		Studio: publicStudioProfileResponse{
			ID:                    workspaceID.String(),
			Name:                  name,
			DisplayName:           displayName,
			BrandName:             brandName,
			BrandAccentColor:      accent,
			PublicBrandingEnabled: publicBranding,
			CanCustomize:          canCustomize,
			TierSlug:              tier,
			AddressLine1:          address1,
			AddressLine2:          address2,
			City:                  city,
			PostalCode:            postal,
			Phone:                 phone,
			Email:                 email,
			Website:               website,
			LogoURL:               logoURL,
			BusinessProfileSlug:   businessSlug,
			BusinessUniqueCode:    businessCode,
			BusinessSubdomain:     subdomain,
			PublicURL:             publicStudioSubdomainURL(subdomain),
		},
		Galleries: galleries,
		Counts: map[string]int{
			"published_galleries": len(galleries),
		},
	})
}

func (h *PublicGalleryHandler) listPublishedStudioGalleries(ctx context.Context, workspaceID uuid.UUID, subdomain string) ([]publicStudioGalleryResponse, error) {
	if h.pool == nil {
		return nil, fmt.Errorf("missing db pool")
	}

	rows, err := h.pool.Query(ctx, `
		SELECT
			g.id,
			g.title,
			g.slug,
			COALESCE(g.description, ''),
			g.gallery_type,
			g.created_at,
			g.published_at,
			g.download_enabled,
			cover_asset.thumbnail_urls
		FROM galleries g
		LEFT JOIN LATERAL (
			SELECT a.thumbnail_urls
			FROM gallery_assets ga
			INNER JOIN assets a ON a.id = ga.asset_id
			WHERE ga.gallery_id = g.id
			  AND a.deleted_at IS NULL
			ORDER BY
				CASE WHEN g.cover_asset_id IS NOT NULL AND a.id = g.cover_asset_id THEN 0 ELSE 1 END,
				ga.is_hero DESC,
				ga.sort_order ASC,
				ga.added_at ASC
			LIMIT 1
		) cover_asset ON true
		WHERE g.workspace_id = $1
		  AND g.deleted_at IS NULL
		  AND g.is_published = true
		  AND (g.status IS NULL OR g.status <> 'archived')
		  AND g.archived_at IS NULL
		  AND (g.expires_at IS NULL OR g.expires_at > now())`+publicStudioSafeGalleryPredicate+`
		ORDER BY COALESCE(g.published_at, g.created_at) DESC, g.created_at DESC
		LIMIT 60`,
		workspaceID,
	)
	if err != nil {
		return nil, fmt.Errorf("public studio list galleries: %w", err)
	}
	defer rows.Close()

	out := []publicStudioGalleryResponse{}
	for rows.Next() {
		var (
			id          uuid.UUID
			gallery     publicStudioGalleryResponse
			coverThumbs *map[string]string
		)
		if err := rows.Scan(
			&id,
			&gallery.Title,
			&gallery.Slug,
			&gallery.Description,
			&gallery.GalleryType,
			&gallery.CreatedAt,
			&gallery.PublishedAt,
			&gallery.DownloadEnabled,
			&coverThumbs,
		); err != nil {
			return nil, fmt.Errorf("public studio list galleries scan: %w", err)
		}
		gallery.ID = id.String()
		if coverThumbs != nil {
			gallery.CoverThumbnails = *coverThumbs
		}
		gallery.PublicURL = publicStudioSubdomainURL(subdomain) + "/" + gallery.Slug
		out = append(out, gallery)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("public studio list galleries rows: %w", err)
	}
	return out, nil
}

// GetBySlug handles GET /api/v1/public/galleries/{slug}
func (h *PublicGalleryHandler) GetBySlug(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}

	gallery, err := h.resolveGalleryForRequest(r, slug)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if gallery == nil {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}
	if !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not published"}`, http.StatusNotFound)
		return
	}

	// M19 F-009: Gallery expiry enforcement
	if gallery.ExpiresAt != nil && gallery.ExpiresAt.Before(time.Now().UTC()) {
		respondJSON(w, http.StatusGone, map[string]interface{}{
			"expired":    true,
			"expired_at": gallery.ExpiresAt,
			"title":      gallery.Title,
		})
		return
	}

	// S4-G2/G3 (audit 2026-05-31): if the request carries ?share=<token> for
	// this gallery, validate + bind a durable share session here so the share
	// landing page (which calls GetBySlug first) establishes the session that
	// the asset/album/byte paths then require. Best-effort — an invalid/expired
	// share link simply doesn't establish a session and the gating below kicks
	// in. tryBindShareSession only mints on success.
	hasSession := h.tryBindShareSession(w, r, gallery) || h.hasValidGallerySession(r, gallery)

	// S4-G3: private / invite-only galleries return only a minimal "locked"
	// shell to anonymous clients — never the cover thumbnails or full settings
	// that the asset surfaces leak through. The viewer renders an invite/share
	// prompt from this. With a valid session the full payload is returned.
	mode := strings.ToLower(strings.TrimSpace(gallery.AccessMode))
	if (mode == "private" || mode == "invite-only") && !hasSession {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"id":           gallery.ID.String(),
			"title":        gallery.Title,
			"access_mode":  gallery.AccessMode,
			"access_gated": true,
			"has_password": gallery.PasswordHash != nil && *gallery.PasswordHash != "",
		})
		return
	}

	// M19 F-009: Enrich settings with computed fields for the public client
	if gallery.Settings == nil {
		gallery.Settings = make(map[string]interface{})
	}
	// Cover template data
	if gallery.CoverTemplate != "" && gallery.CoverTemplate != "none" {
		gallery.Settings["cover_template"] = gallery.CoverTemplate
		gallery.Settings["cover_config"] = gallery.CoverConfig
	}
	// Password protection indicator (PasswordHash is json:"-" so never leaks)
	gallery.Settings["has_password"] = gallery.PasswordHash != nil && *gallery.PasswordHash != ""
	// M22 E74-S1: Expose watermark config and selection limit to public client
	if gallery.WatermarkConfig != nil {
		gallery.Settings["watermark_config"] = gallery.WatermarkConfig
	}
	gallery.Settings["max_selections"] = gallery.MaxSelections

	// Resolve the design-studio cover asset and attach its thumbnail URLs.
	// The public viewer needs these to render the saved cover even when the
	// share link is scoped to an album (?album=X) that doesn't contain the
	// cover asset itself — without this, ListAssets would return only the
	// album's assets and the hero would either fall back to assets[0] or
	// render no cover at all. The design's `cover.assetId` takes precedence
	// over the legacy `gallery.cover_asset_id`; both are tried before
	// giving up. Best-effort: any failure leaves cover_thumbnails unset and
	// the frontend falls back to its existing legacy behavior.
	if h.assetSvc != nil {
		if coverID := resolveDesignCoverAssetID(gallery.Settings, gallery.CoverAssetID); coverID != nil {
			if coverAsset, err := h.assetSvc.GetByID(r.Context(), *coverID); err == nil && coverAsset != nil && len(coverAsset.ThumbnailURLs) > 0 {
				gallery.Settings["cover_thumbnails"] = coverAsset.ThumbnailURLs
				gallery.Settings["cover_asset_resolved_id"] = coverAsset.ID.String()
			}
		}
	}

	// SEC-1 (security audit 2026-05-30): mint a short-lived, gallery-scoped,
	// signed asset-access token so header-less <img>/<audio> byte loads
	// (split-origin) can authenticate via ?at= instead of carrying the durable
	// session token in the URL. Only minted once access is PROVEN (hasSession),
	// never for a password/private gallery viewed without a valid session, so
	// the token can't bypass the gate. Open galleries serve bytes anonymously
	// and need no token. Best-effort: only available on the stateless HMAC path
	// (prod signing key wired); gallery.Settings is already non-nil here.
	if h.accessSvc != nil && hasSession {
		if at, err := h.accessSvc.IssueAssetAccessToken(gallery.ID); err == nil {
			gallery.Settings["asset_access_token"] = at
		}
	}

	respondJSON(w, http.StatusOK, gallery)
}

// resolveDesignCoverAssetID returns the asset ID the public viewer should use
// for the cover thumbnail. Checks design_config.cover.assetId first, then
// falls back to the gallery's legacy CoverAssetID. Returns nil only when
// neither source has a usable UUID.
func resolveDesignCoverAssetID(settings map[string]interface{}, fallback *uuid.UUID) *uuid.UUID {
	if settings != nil {
		if raw, ok := settings["design_config"]; ok {
			if m, ok := raw.(map[string]interface{}); ok {
				if cover, ok := m["cover"].(map[string]interface{}); ok {
					if idStr, ok := cover["assetId"].(string); ok && idStr != "" {
						if parsed, err := uuid.Parse(idStr); err == nil {
							return &parsed
						}
					}
				}
			}
		}
	}
	return fallback
}

// publicAssetResponse is the enriched asset returned to public gallery viewers.
type publicAssetResponse struct {
	ID              string                 `json:"id"`
	Filename        string                 `json:"filename"`
	ContentType     string                 `json:"content_type"`
	Width           *int                   `json:"width,omitempty"`
	Height          *int                   `json:"height,omitempty"`
	Blurhash        *string                `json:"blurhash,omitempty"`
	ThumbnailURLs   map[string]string      `json:"thumbnail_urls"`
	IsEncrypted     bool                   `json:"is_encrypted"`
	MediaEncryption map[string]interface{} `json:"media_encryption,omitempty"`
	SortOrder       int                    `json:"sort_order"`
}

// resolveAssetsByID bulk-fetches the given asset IDs and returns an O(1)
// lookup map keyed by asset ID (F-029). When a batch source is wired it issues
// a single `id = ANY($1)` query, collapsing the previous one-GetByID-per-asset
// N+1 on the unauthenticated hot read path. When no batch source is available
// (handler constructed without a pool) it degrades to per-ID assetSvc.GetByID
// calls so behaviour is unchanged for those callers.
//
// Missing or soft-deleted assets are simply absent from the map; callers skip
// them, matching the prior "skip missing assets" behaviour.
func (h *PublicGalleryHandler) resolveAssetsByID(ctx context.Context, ids []uuid.UUID) map[uuid.UUID]*repository.Asset {
	byID := make(map[uuid.UUID]*repository.Asset, len(ids))
	if len(ids) == 0 {
		return byID
	}

	if h.assetBatch != nil {
		assets, err := h.assetBatch.GetByIDs(ctx, ids)
		if err == nil {
			for _, a := range assets {
				if a != nil {
					byID[a.ID] = a
				}
			}
			return byID
		}
		// On bulk-fetch error fall through to the per-ID path so a transient
		// batch failure degrades gracefully rather than emptying the gallery.
	}

	// Per-ID fallback. Only reachable when no batch source is wired, or when a
	// wired batch source erred. Guarded against a nil assetSvc so degraded
	// constructions (no pool, no asset service) return an empty map instead of
	// panicking on the unauthenticated public path.
	if h.assetSvc == nil {
		return byID
	}
	for _, id := range ids {
		asset, err := h.assetSvc.GetByID(ctx, id)
		if err != nil || asset == nil {
			continue
		}
		byID[id] = asset.Asset
	}
	return byID
}

// ListAssets handles GET /api/v1/public/galleries/{slug}/assets
func (h *PublicGalleryHandler) ListAssets(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	gallery, err := h.resolveGalleryForRequest(r, slug)
	if err != nil || gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}
	if !h.requirePublicGallerySession(w, r, gallery) {
		return
	}

	galleryAssets, err := h.gallerySvc.ListAssets(r.Context(), gallery.ID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Enrich gallery assets with full asset details. F-029: fetch every asset
	// in one query and index by ID instead of issuing a GetByID per junction
	// row (which scaled the public hot path linearly with photo count).
	ids := make([]uuid.UUID, 0, len(galleryAssets))
	for _, ga := range galleryAssets {
		ids = append(ids, ga.AssetID)
	}
	assetsByID := h.resolveAssetsByID(r.Context(), ids)

	var result []publicAssetResponse
	for _, ga := range galleryAssets {
		asset, ok := assetsByID[ga.AssetID]
		if !ok {
			continue // skip missing assets
		}
		result = append(result, publicAssetResponse{
			ID:              asset.ID.String(),
			Filename:        asset.Filename,
			ContentType:     asset.ContentType,
			Width:           asset.Width,
			Height:          asset.Height,
			Blurhash:        asset.Blurhash,
			ThumbnailURLs:   asset.ThumbnailURLs,
			IsEncrypted:     asset.IsEncrypted,
			MediaEncryption: asset.MediaEncryption,
			SortOrder:       ga.SortOrder,
		})
	}

	respondJSON(w, http.StatusOK, result)
}

// publicAlbumResponse is the shape returned by GET .../albums for the
// public viewer. Excludes owner-only fields like description,
// cover_asset_id, parent_id, and the raw smart_filter JSON — guests only
// need enough to render a filter chip (id, name, count, isSmart hint).
type publicAlbumResponse struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	AssetCount int    `json:"asset_count"`
	IsSmart    bool   `json:"is_smart"`
	Position   int    `json:"position"`
}

// ListAlbums handles GET /api/v1/public/galleries/{slug}/albums.
//
// Returns the gallery's albums + utility smart albums with asset counts so
// the public viewer can render a chip strip beneath the cover image (All
// Photos, sub-galleries, Favorites, Videos, RAW). Counts are resolved
// through albumSvc.ListAssets which already dispatches smart-album
// resolution (M41/105 favorites + content_type filters), so the same
// numbers shown to the photographer in the dashboard appear here.
//
// Empty albums are included (Videos 0, RAW 0) — the chip's count badge
// is part of the affordance even when zero. The owner-only manual albums
// with zero photos are also included since photographers may publish
// galleries with planned-but-unfilled sub-galleries.
func (h *PublicGalleryHandler) ListAlbums(w http.ResponseWriter, r *http.Request) {
	if h.albumSvc == nil {
		http.Error(w, `{"error":"album service unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	slug := chi.URLParam(r, "slug")
	gallery, err := h.resolveGalleryForRequest(r, slug)
	if err != nil || gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}
	if !h.requirePublicGallerySession(w, r, gallery) {
		return
	}

	albums, err := h.albumSvc.ListByGallery(r.Context(), gallery.ID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	result := make([]publicAlbumResponse, 0, len(albums))
	for _, a := range albums {
		// Count via ListAssets so smart-album resolution (favorites,
		// content_type) is honored. ListAssets is cheap for smart
		// albums on small galleries; if this becomes hot for large
		// galleries we can add a dedicated COUNT(*) path later.
		assets, err := h.albumSvc.ListAssets(r.Context(), a.ID)
		count := 0
		if err == nil {
			count = len(assets)
		}
		result = append(result, publicAlbumResponse{
			ID:         a.ID.String(),
			Name:       a.Name,
			AssetCount: count,
			IsSmart:    len(a.SmartFilter) > 0,
			Position:   a.Position,
		})
	}

	respondJSON(w, http.StatusOK, result)
}

// ListAlbumAssets handles GET /api/v1/public/galleries/{slug}/albums/{albumId}/assets.
func (h *PublicGalleryHandler) ListAlbumAssets(w http.ResponseWriter, r *http.Request) {
	if h.albumSvc == nil {
		http.Error(w, `{"error":"album service unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	slug := chi.URLParam(r, "slug")
	albumID, err := uuid.Parse(chi.URLParam(r, "albumId"))
	if err != nil {
		http.Error(w, `{"error":"invalid album id"}`, http.StatusBadRequest)
		return
	}

	gallery, err := h.resolveGalleryForRequest(r, slug)
	if err != nil || gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}
	if !h.requirePublicGallerySession(w, r, gallery) {
		return
	}

	album, err := h.albumSvc.GetByID(r.Context(), albumID)
	if err != nil || album == nil || album.GalleryID != gallery.ID {
		http.Error(w, `{"error":"album not found"}`, http.StatusNotFound)
		return
	}

	albumAssets, err := h.albumSvc.ListAssets(r.Context(), albumID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// F-029: same single-query enrichment as ListAssets — one bulk fetch keyed
	// by ID rather than a GetByID per album-asset junction row.
	ids := make([]uuid.UUID, 0, len(albumAssets))
	for _, aa := range albumAssets {
		ids = append(ids, aa.AssetID)
	}
	assetsByID := h.resolveAssetsByID(r.Context(), ids)

	result := make([]publicAssetResponse, 0, len(albumAssets))
	for _, aa := range albumAssets {
		asset, ok := assetsByID[aa.AssetID]
		if !ok {
			continue
		}
		result = append(result, publicAssetResponse{
			ID:              asset.ID.String(),
			Filename:        asset.Filename,
			ContentType:     asset.ContentType,
			Width:           asset.Width,
			Height:          asset.Height,
			Blurhash:        asset.Blurhash,
			ThumbnailURLs:   asset.ThumbnailURLs,
			IsEncrypted:     asset.IsEncrypted,
			MediaEncryption: asset.MediaEncryption,
			SortOrder:       aa.Position,
		})
	}

	respondJSON(w, http.StatusOK, result)
}

// VerifyPIN handles POST /api/v1/public/galleries/{slug}/verify-pin
func (h *PublicGalleryHandler) VerifyPIN(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Token string `json:"token"`
		PIN   string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	valid, err := h.shareSvc.VerifyPIN(r.Context(), input.Token, input.PIN)
	if err != nil {
		http.Error(w, `{"error":"verification failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"valid": valid})
}

// ──────────────────────────────────────────────────────────────────────────────
// M13 Deferred FR Closure (v0.0.29)
// ──────────────────────────────────────────────────────────────────────────────

// brandingResponse is the public-facing branding payload for a gallery
// (GAL-FR-115). Exposes only what the public viewer needs to render the
// gallery shell — tier, platform brand defaults, and a can_customize flag
// the frontend uses to decide whether to apply studio-level overrides.
type brandingResponse struct {
	TierSlug              string  `json:"tier_slug"`     // free, standard, pro, enterprise
	CanCustomize          bool    `json:"can_customize"` // true when tier supports white-label overrides
	BrandName             string  `json:"brand_name"`
	LogoURL               *string `json:"logo_url,omitempty"`
	LogoAssetID           *string `json:"logo_asset_id,omitempty"`
	AccentColor           *string `json:"accent_color,omitempty"`
	HideFooter            bool    `json:"hide_footer"` // enterprise-only: hide "Powered by RawDrive"
	PublicBrandingEnabled bool    `json:"public_branding_enabled"`
}

// canCustomizeForTier returns true for tiers that may override platform
// branding. Kept in Go (not DB) so the gating rule is visible in code review.
func canCustomizeForTier(tier string) bool {
	switch strings.ToLower(tier) {
	case "pro", "enterprise", "studio":
		return true
	default:
		return false
	}
}

// GetBranding handles GET /api/v1/public/galleries/{slug}/branding (GAL-FR-115).
// Resolves workspace tier via the subscriptions table and decides whether
// the studio is permitted to override platform branding. Falls back to
// platform defaults when no active subscription exists, when the pool is
// not wired, or on any query error (fail-soft: unknown tier = free).
func (h *PublicGalleryHandler) GetBranding(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}

	gallery, err := h.resolveGalleryForRequest(r, slug)
	if err != nil || gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}
	if !h.gateGalleryAccess(w, r, gallery) {
		return
	}

	tier := h.lookupWorkspaceTier(r.Context(), gallery.WorkspaceID)
	workspaceBranding := h.lookupWorkspaceBranding(r.Context(), gallery.WorkspaceID)
	canCustomize := canCustomizeForTier(tier) && workspaceBranding.PublicBrandingEnabled

	brandName := "RawDrive"
	var logoURL *string
	var logoAssetID *string
	var accentColor *string
	if canCustomize {
		if workspaceBranding.BrandName != "" {
			brandName = workspaceBranding.BrandName
		} else if workspaceBranding.WorkspaceName != "" {
			brandName = workspaceBranding.WorkspaceName
		}
		if workspaceBranding.BrandAccentColor != "" {
			accentColor = &workspaceBranding.BrandAccentColor
		}
		if workspaceBranding.LogoAssetID != "" {
			logoAssetID = &workspaceBranding.LogoAssetID
			url := "/api/v1/public/galleries/" + slug + "/branding/logo"
			logoURL = &url
		}
	}

	respondJSON(w, http.StatusOK, brandingResponse{
		TierSlug:              tier,
		CanCustomize:          canCustomize,
		BrandName:             brandName,
		LogoURL:               logoURL,
		LogoAssetID:           logoAssetID,
		AccentColor:           accentColor,
		HideFooter:            tier == "enterprise",
		PublicBrandingEnabled: workspaceBranding.PublicBrandingEnabled,
	})
}

// lookupWorkspaceTier queries the active subscription for the workspace and
// returns the tier_slug. Returns "free" when no active subscription exists,
// the pool is not wired, or the query fails.
func (h *PublicGalleryHandler) lookupWorkspaceTier(ctx context.Context, workspaceID uuid.UUID) string {
	if h.pool == nil {
		return "free"
	}
	var tier string
	err := h.pool.QueryRow(ctx,
		`SELECT COALESCE(tier_slug, 'free')
		   FROM subscriptions
		  WHERE workspace_id = $1
		    AND status = 'active'
		  ORDER BY created_at DESC
		  LIMIT 1`,
		workspaceID,
	).Scan(&tier)
	if err == nil && tier != "" {
		return tier
	}

	err = h.pool.QueryRow(ctx,
		`SELECT COALESCE(plan_tier, 'free') FROM workspaces WHERE id = $1`,
		workspaceID,
	).Scan(&tier)
	if err != nil || tier == "" {
		return "free"
	}
	return tier
}

type publicWorkspaceBranding struct {
	WorkspaceName         string
	BrandName             string
	BrandAccentColor      string
	PublicBrandingEnabled bool
	LogoAssetID           string
}

func (h *PublicGalleryHandler) lookupWorkspaceBranding(ctx context.Context, workspaceID uuid.UUID) publicWorkspaceBranding {
	result := publicWorkspaceBranding{PublicBrandingEnabled: true}
	if h.pool == nil {
		return result
	}

	err := h.pool.QueryRow(ctx, `
		SELECT
			COALESCE(name, ''),
			COALESCE(brand_name, ''),
			COALESCE(brand_accent_color, ''),
			COALESCE(public_branding_enabled, true),
			COALESCE(logo_asset_id::text, '')
		FROM workspaces
		WHERE id = $1`,
		workspaceID,
	).Scan(&result.WorkspaceName, &result.BrandName, &result.BrandAccentColor, &result.PublicBrandingEnabled, &result.LogoAssetID)
	if err != nil {
		return publicWorkspaceBranding{PublicBrandingEnabled: true}
	}
	return result
}

// GetBrandingLogo streams the workspace logo through the application after
// resolving the public gallery slug and plan gate. It never exposes the
// object-store storage key or public bucket URL to the browser.
func (h *PublicGalleryHandler) GetBrandingLogo(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}

	gallery, err := h.resolveGalleryForRequest(r, slug)
	if err != nil || gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}
	if !h.gateGalleryAccess(w, r, gallery) {
		return
	}
	if h.assetSvc == nil || h.pool == nil {
		http.Error(w, `{"error":"branding logo unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	tier := h.lookupWorkspaceTier(r.Context(), gallery.WorkspaceID)
	workspaceBranding := h.lookupWorkspaceBranding(r.Context(), gallery.WorkspaceID)
	if !canCustomizeForTier(tier) || !workspaceBranding.PublicBrandingEnabled || workspaceBranding.LogoAssetID == "" {
		http.Error(w, `{"error":"branding logo not available"}`, http.StatusNotFound)
		return
	}

	logoAssetID, err := uuid.Parse(workspaceBranding.LogoAssetID)
	if err != nil {
		http.Error(w, `{"error":"branding logo invalid"}`, http.StatusNotFound)
		return
	}

	var storageKey, contentType, filename string
	err = h.pool.QueryRow(r.Context(), `
		SELECT storage_key, content_type, filename
		FROM assets
		WHERE id = $1
		  AND workspace_id = $2
		  AND deleted_at IS NULL
		  AND content_type LIKE 'image/%'`,
		logoAssetID, gallery.WorkspaceID,
	).Scan(&storageKey, &contentType, &filename)
	if err != nil {
		http.Error(w, `{"error":"branding logo not found"}`, http.StatusNotFound)
		return
	}

	reader, err := h.assetSvc.GetStorageReader(r.Context(), storageKey)
	if err != nil {
		http.Error(w, `{"error":"branding logo retrieval failed"}`, http.StatusInternalServerError)
		return
	}
	defer reader.Close()

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, filename))
	_, _ = io.Copy(w, reader)
}

// GetGalleryMusic streams the gallery's slideshow background-music asset
// through the application after resolving the slug and applying the full public
// access gate (published, expiry, share/password/access-mode). Mirrors
// GetBrandingLogo — never exposes the object-store key or bucket URL. The audio
// asset was uploaded through the normal quota-counted asset path, so this only
// reads it back; no separate storage accounting is required here.
func (h *PublicGalleryHandler) GetGalleryMusic(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}

	gallery, err := h.resolveGalleryForRequest(r, slug)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	// Full public access gate — handles nil/unpublished (404), expiry (410),
	// and private/password/access-mode session requirements.
	if !h.gateGalleryAccess(w, r, gallery) {
		return
	}
	if h.assetSvc == nil || h.pool == nil {
		http.Error(w, `{"error":"gallery music unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	if gallery.MusicAssetID == nil {
		http.Error(w, `{"error":"gallery has no music"}`, http.StatusNotFound)
		return
	}

	var storageKey, contentType, filename string
	err = h.pool.QueryRow(r.Context(), `
		SELECT storage_key, content_type, filename
		FROM assets
		WHERE id = $1
		  AND workspace_id = $2
		  AND deleted_at IS NULL
		  AND content_type LIKE 'audio/%'`,
		*gallery.MusicAssetID, gallery.WorkspaceID,
	).Scan(&storageKey, &contentType, &filename)
	if err != nil {
		http.Error(w, `{"error":"gallery music not found"}`, http.StatusNotFound)
		return
	}

	reader, err := h.assetSvc.GetStorageReader(r.Context(), storageKey)
	if err != nil {
		http.Error(w, `{"error":"gallery music retrieval failed"}`, http.StatusInternalServerError)
		return
	}
	defer reader.Close()

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, filename))
	w.Header().Set("Cache-Control", "private, max-age=3600")
	_, _ = io.Copy(w, reader)
}

// GetStudioLogo handles GET /api/v1/public/studios/{subdomain}/logo.
// This mirrors GetBrandingLogo without requiring a gallery slug, so the
// business-subdomain root page can render the studio logo without exposing a
// storage key or bucket URL to the browser.
func (h *PublicGalleryHandler) GetStudioLogo(w http.ResponseWriter, r *http.Request) {
	subdomain := strings.ToLower(strings.TrimSpace(chi.URLParam(r, "subdomain")))
	code := publicStudioBusinessCodeFromSubdomain(subdomain)
	if code == "" {
		http.Error(w, `{"error":"invalid studio subdomain"}`, http.StatusBadRequest)
		return
	}
	if h.assetSvc == nil || h.pool == nil {
		http.Error(w, `{"error":"studio logo unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	var (
		workspaceID    uuid.UUID
		logoAssetIDRaw string
		publicBranding bool
	)
	err := h.pool.QueryRow(r.Context(), `
		SELECT id, COALESCE(logo_asset_id::text, ''), COALESCE(public_branding_enabled, true)
		FROM workspaces
		WHERE business_unique_code = $1
		  AND deleted_at IS NULL
		LIMIT 1`,
		code,
	).Scan(&workspaceID, &logoAssetIDRaw, &publicBranding)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"studio not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to load studio logo"}`, http.StatusInternalServerError)
		return
	}

	tier := h.lookupWorkspaceTier(r.Context(), workspaceID)
	if !canCustomizeForTier(tier) || !publicBranding || logoAssetIDRaw == "" {
		http.Error(w, `{"error":"studio logo not available"}`, http.StatusNotFound)
		return
	}

	logoAssetID, err := uuid.Parse(logoAssetIDRaw)
	if err != nil {
		http.Error(w, `{"error":"studio logo invalid"}`, http.StatusNotFound)
		return
	}

	var storageKey, contentType, filename string
	err = h.pool.QueryRow(r.Context(), `
		SELECT storage_key, content_type, filename
		FROM assets
		WHERE id = $1
		  AND workspace_id = $2
		  AND deleted_at IS NULL
		  AND content_type LIKE 'image/%'`,
		logoAssetID, workspaceID,
	).Scan(&storageKey, &contentType, &filename)
	if err != nil {
		http.Error(w, `{"error":"studio logo not found"}`, http.StatusNotFound)
		return
	}

	reader, err := h.assetSvc.GetStorageReader(r.Context(), storageKey)
	if err != nil {
		http.Error(w, `{"error":"studio logo retrieval failed"}`, http.StatusInternalServerError)
		return
	}
	defer reader.Close()

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, filename))
	_, _ = io.Copy(w, reader)
}

// faceMatchRequest accepts a pre-computed face embedding from the client.
//
// Design: embedding extraction happens in the browser via face-api.js so the
// selfie itself never leaves the user's device — this is both a privacy
// feature (biometric consent, GAL-FR-107) and keeps Go off the ML hot path.
// The client posts only the 512-float descriptor vector.
type faceMatchRequest struct {
	Embedding    []float32 `json:"embedding"`
	ConsentGiven bool      `json:"consent_given"`
	Threshold    *float64  `json:"threshold,omitempty"` // clamped 0.3–0.95, default 0.6
}

type faceMatchResponse struct {
	GalleryID         string   `json:"gallery_id"`
	AssetIDs          []string `json:"asset_ids"`
	MatchCount        int      `json:"match_count"`
	Threshold         float64  `json:"threshold"`
	FallbackAvailable bool     `json:"fallback_available"` // GAL-FR-109 — always true
}

// FaceMatch handles POST /api/v1/public/galleries/{slug}/face-match
// (GAL-FR-107/108/109).
//
// Enforces:
//   - gallery.settings.faceid_enabled = true (opt-in per gallery)
//   - explicit consent_given = true in request body (GAL-FR-107)
//   - matches are strictly gallery-scoped via FindSimilarFacesInGallery
//     (GAL-FR-108 — cross-gallery leakage impossible at the SQL layer)
//   - fallback_available = true in every response so zero-match selfies
//     don't trap the user (GAL-FR-109 — frontend always shows "Browse all")
func (h *PublicGalleryHandler) FaceMatch(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}

	var req faceMatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	if !req.ConsentGiven {
		http.Error(w, `{"error":"biometric_consent_required"}`, http.StatusForbidden)
		return
	}
	if len(req.Embedding) == 0 {
		http.Error(w, `{"error":"embedding required"}`, http.StatusBadRequest)
		return
	}

	gallery, err := h.resolveGalleryForRequest(r, slug)
	if err != nil || gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}
	// S4-G5: face-match leaks photo identities on protected galleries unless
	// the gallery's password/access-mode/share gate is satisfied first.
	if !h.gateGalleryAccess(w, r, gallery) {
		return
	}

	// Per-gallery FaceID opt-in — feature is off by default so studios must
	// explicitly enable it in gallery settings.
	faceIDEnabled, _ := gallery.Settings["faceid_enabled"].(bool)
	if !faceIDEnabled {
		http.Error(w, `{"error":"faceid_disabled_for_gallery"}`, http.StatusNotFound)
		return
	}

	if h.faceRepo == nil {
		http.Error(w, `{"error":"faceid_service_unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	threshold := 0.6
	if req.Threshold != nil {
		threshold = *req.Threshold
		if threshold < 0.3 {
			threshold = 0.3
		}
		if threshold > 0.95 {
			threshold = 0.95
		}
	}

	matches, err := h.faceRepo.FindSimilarFacesInGallery(r.Context(), req.Embedding, gallery.ID, threshold, 200)
	if err != nil {
		http.Error(w, `{"error":"face match failed"}`, http.StatusInternalServerError)
		return
	}

	// Dedupe by asset_id — a single asset can contain multiple matching faces.
	seen := make(map[string]bool, len(matches))
	ids := make([]string, 0, len(matches))
	for _, fc := range matches {
		key := fc.AssetID.String()
		if !seen[key] {
			seen[key] = true
			ids = append(ids, key)
		}
	}

	respondJSON(w, http.StatusOK, faceMatchResponse{
		GalleryID:         gallery.ID.String(),
		AssetIDs:          ids,
		MatchCount:        len(ids),
		Threshold:         threshold,
		FallbackAvailable: true,
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// PR-3b: Public People tab — read-only face cluster + photos lookup by slug
// ──────────────────────────────────────────────────────────────────────────────

// publicPersonResponse is the public-safe projection of an ai.ClusterSummary.
// We deliberately drop the workspace-owner-only sample_bounding_box for now —
// guest viewers see the same fields the studio People grid uses, except the
// face-crop math will fall back to object-position:center.
type publicPersonResponse struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	FaceCount  int    `json:"face_count"`
	AssetCount int    `json:"asset_count"`
	CoverAsset string `json:"cover_asset_id"`
}

// isFaceRecognitionEnabledForGallery checks both gates that must pass before
// guests can see face data:
//
//  1. workspaces.face_recognition_enabled (migration 110) — workspace-level
//     opt-in for biometric data processing under Indian DPDP / EU GDPR.
//  2. galleries.face_detection_enabled (migration 046) — per-gallery
//     opt-out, defaults true.
//
// Returns false when either gate is closed. Errors propagate as false +
// non-nil error so the caller can fail-closed.
func (h *PublicGalleryHandler) isFaceRecognitionEnabledForGallery(ctx context.Context, galleryID, workspaceID uuid.UUID) (bool, error) {
	if h.pool == nil {
		// Public handler started without WithM13Deps wiring — fail closed.
		return false, fmt.Errorf("face recognition deps not wired")
	}
	var wsEnabled, galEnabled bool
	err := h.pool.QueryRow(ctx, `
		SELECT
		  (SELECT face_recognition_enabled FROM workspaces WHERE id = $1),
		  (SELECT face_detection_enabled   FROM galleries  WHERE id = $2)
	`, workspaceID, galleryID).Scan(&wsEnabled, &galEnabled)
	if err != nil {
		return false, err
	}
	return wsEnabled && galEnabled, nil
}

// ListPeople handles GET /api/v1/public/galleries/{slug}/people. Read-only
// listing of face clusters for a published gallery, gated on the workspace
// + per-gallery opt-in flags. Guests cannot rename / merge / split — those
// stay on the authed studio /api/v1/ai/clusters endpoints.
func (h *PublicGalleryHandler) ListPeople(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}
	gallery, err := h.resolveGalleryForRequest(r, slug)
	if err != nil || gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}
	// S4-G5: people listing leaks identities on protected galleries unless the
	// password/access-mode/share gate is satisfied first.
	if !h.gateGalleryAccess(w, r, gallery) {
		return
	}
	if h.faceRepo == nil {
		// Treat unwired faceRepo as "feature unavailable" rather than 500
		// so the public viewer can degrade gracefully.
		respondJSON(w, http.StatusOK, []publicPersonResponse{})
		return
	}
	enabled, err := h.isFaceRecognitionEnabledForGallery(r.Context(), gallery.ID, gallery.WorkspaceID)
	if err != nil {
		http.Error(w, `{"error":"face recognition status check failed"}`, http.StatusInternalServerError)
		return
	}
	if !enabled {
		// Same "feature off" projection as the unwired-handler case. The
		// public viewer's UI hides the People tab when this returns empty.
		respondJSON(w, http.StatusOK, []publicPersonResponse{})
		return
	}
	gid := gallery.ID
	clusters, err := h.faceRepo.ListClusters(r.Context(), gallery.WorkspaceID, &gid)
	if err != nil {
		http.Error(w, `{"error":"failed to list people"}`, http.StatusInternalServerError)
		return
	}
	out := make([]publicPersonResponse, 0, len(clusters))
	for _, c := range clusters {
		out = append(out, publicPersonResponse{
			ID:         c.ClusterLabel.String(),
			Name:       c.ClusterName,
			FaceCount:  c.FaceCount,
			AssetCount: c.AssetCount,
			CoverAsset: c.SampleAssetID.String(),
		})
	}
	respondJSON(w, http.StatusOK, out)
}

// ListPersonPhotos handles GET /api/v1/public/galleries/{slug}/people/{personId}/photos.
// Returns the asset IDs in the gallery that contain the given person. Uses
// the gallery-scoped ListClusterAssetIDsInGallery (not the workspace-scoped
// helper) so a guest viewer of gallery A cannot enumerate the same person's
// photos in gallery B of the same workspace.
func (h *PublicGalleryHandler) ListPersonPhotos(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}
	personIDStr := chi.URLParam(r, "personId")
	personID, err := uuid.Parse(personIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid personId"}`, http.StatusBadRequest)
		return
	}
	gallery, err := h.resolveGalleryForRequest(r, slug)
	if err != nil || gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}
	// S4-G5: person-photos enumeration is gated by the gallery's
	// password/access-mode/share protection.
	if !h.gateGalleryAccess(w, r, gallery) {
		return
	}
	if h.faceRepo == nil {
		respondJSON(w, http.StatusOK, map[string]any{"asset_ids": []string{}, "count": 0})
		return
	}
	enabled, err := h.isFaceRecognitionEnabledForGallery(r.Context(), gallery.ID, gallery.WorkspaceID)
	if err != nil {
		http.Error(w, `{"error":"face recognition status check failed"}`, http.StatusInternalServerError)
		return
	}
	if !enabled {
		respondJSON(w, http.StatusOK, map[string]any{"asset_ids": []string{}, "count": 0})
		return
	}
	ids, err := h.faceRepo.ListClusterAssetIDsInGallery(r.Context(), gallery.ID, personID)
	if err != nil {
		http.Error(w, `{"error":"failed to list person photos"}`, http.StatusInternalServerError)
		return
	}
	stringIDs := make([]string, 0, len(ids))
	for _, id := range ids {
		stringIDs = append(stringIDs, id.String())
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"asset_ids": stringIDs,
		"count":     len(stringIDs),
	})
}

// PhotoSearch handles POST /api/v1/public/galleries/{slug}/photo-search.
// Guest-side counterpart to the dashboard Photo Search — the visitor
// captures a face on their device camera and POSTs the JPEG; we run
// face-svc to detect+embed, vote across candidates GALLERY-SCOPED, and
// return the matched cluster's photos.
//
// Critical security difference from the dashboard endpoint: this is
// anonymous, so candidate retrieval is restricted to faces whose asset
// is in THIS gallery (FindSimilarFacesInGalleryScored). A workspace-
// wide search would let a guest enumerate other galleries' identities
// just by visiting one shared link — that is exactly what
// FindSimilarFacesInGallery and ListClusterAssetIDsInGallery exist to
// prevent.
//
// Gates: both workspaces.face_recognition_enabled (DPDP/GDPR opt-in)
// and galleries.face_detection_enabled (per-gallery opt-out) must
// pass, mirroring the public People tab. We deliberately reuse the
// People-tab gate function — Photo Search is just the action-verb
// form of the same surface.
//
// Body cap 10 MB. face-svc enforces its own 20 MB cap on top.
func (h *PublicGalleryHandler) PhotoSearch(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}

	gallery, err := h.resolveGalleryForRequest(r, slug)
	if err != nil || gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}
	// S4-G5: photo-search returns matched photo IDs — gate it behind the
	// gallery's password/access-mode/share protection.
	if !h.gateGalleryAccess(w, r, gallery) {
		return
	}

	if h.faceRepo == nil || h.faceClient == nil {
		http.Error(w, `{"error":"photo search not available"}`, http.StatusServiceUnavailable)
		return
	}

	enabled, err := h.isFaceRecognitionEnabledForGallery(r.Context(), gallery.ID, gallery.WorkspaceID)
	if err != nil {
		http.Error(w, `{"error":"face recognition status check failed"}`, http.StatusInternalServerError)
		return
	}
	if !enabled {
		http.Error(w, `{"error":"photo search disabled for this gallery"}`, http.StatusForbidden)
		return
	}

	const maxUpload = 10 << 20
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload)
	if err := r.ParseMultipartForm(maxUpload); err != nil {
		http.Error(w, `{"error":"could not parse upload"}`, http.StatusBadRequest)
		return
	}
	file, _, err := r.FormFile("image")
	if err != nil {
		http.Error(w, `{"error":"image file required (form field 'image')"}`, http.StatusBadRequest)
		return
	}
	defer file.Close()

	imageData, err := io.ReadAll(file)
	if err != nil || len(imageData) == 0 {
		http.Error(w, `{"error":"empty or unreadable image"}`, http.StatusBadRequest)
		return
	}

	resp, err := h.faceClient.DetectAndEmbed(r.Context(), imageData, "public-search.jpg")
	if err != nil {
		http.Error(w, `{"error":"face detection failed"}`, http.StatusBadGateway)
		return
	}
	if len(resp.Faces) == 0 {
		respondJSON(w, http.StatusOK, map[string]any{
			"found":          false,
			"faces_detected": 0,
			"asset_ids":      []string{},
			"count":          0,
		})
		return
	}

	// Highest-confidence face wins (foreground subject vs background bystanders).
	best := resp.Faces[0]
	for i := range resp.Faces[1:] {
		f := resp.Faces[i+1]
		if f.DetScore > best.DetScore {
			best = f
		}
	}

	// Match dashboard knobs — see face_service.SearchByFace comment block
	// for the derivation. The retrieval pool is intentionally generous
	// because webcam captures vs studio photos sit in the 0.35-0.55 band
	// of cosine similarity, and the cluster-vote step absorbs any spurious
	// neighbours.
	const (
		retrievalThreshold = 0.30
		retrievalLimit     = 20
		minBestSimilarity  = 0.40
		minAggregateScore  = 0.80
	)

	matches, err := h.faceRepo.FindSimilarFacesInGalleryScored(r.Context(), best.Embedding, gallery.ID, retrievalThreshold, retrievalLimit)
	if err != nil {
		http.Error(w, `{"error":"face match failed"}`, http.StatusInternalServerError)
		return
	}
	if len(matches) == 0 {
		respondJSON(w, http.StatusOK, map[string]any{
			"found":          false,
			"faces_detected": len(resp.Faces),
			"asset_ids":      []string{},
			"count":          0,
		})
		return
	}

	// Cluster vote — identical algorithm to the dashboard side. Group by
	// cluster_label, track each cluster's best individual similarity and
	// aggregate sum, pick the cluster with the highest aggregate. See
	// face_service.SearchByFace for the rationale.
	type clusterAgg struct {
		label     uuid.UUID
		name      string
		bestSim   float64
		aggregate float64
		hits      int
	}
	aggByLabel := make(map[uuid.UUID]*clusterAgg, 8)
	for _, m := range matches {
		if m.Face.ClusterLabel == nil {
			continue
		}
		k := *m.Face.ClusterLabel
		a, ok := aggByLabel[k]
		if !ok {
			a = &clusterAgg{label: k, name: m.Face.ClusterName}
			aggByLabel[k] = a
		}
		if a.name == "" && m.Face.ClusterName != "" {
			a.name = m.Face.ClusterName
		}
		if m.Similarity > a.bestSim {
			a.bestSim = m.Similarity
		}
		a.aggregate += m.Similarity
		a.hits++
	}

	var winner *clusterAgg
	for _, a := range aggByLabel {
		if winner == nil || a.aggregate > winner.aggregate {
			winner = a
		}
	}

	if winner == nil || (winner.bestSim < minBestSimilarity && winner.aggregate < minAggregateScore) {
		respondJSON(w, http.StatusOK, map[string]any{
			"found":          false,
			"faces_detected": len(resp.Faces),
			"asset_ids":      []string{},
			"count":          0,
		})
		return
	}

	// Gallery-scoped asset list. Uses the same helper the public People
	// tab uses for click-through — guarantees the visitor only sees
	// photos from THIS shared gallery, never any other workspace gallery.
	assetIDs, err := h.faceRepo.ListClusterAssetIDsInGallery(r.Context(), gallery.ID, winner.label)
	if err != nil {
		http.Error(w, `{"error":"could not load matched photos"}`, http.StatusInternalServerError)
		return
	}
	stringIDs := make([]string, 0, len(assetIDs))
	for _, id := range assetIDs {
		stringIDs = append(stringIDs, id.String())
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"found":          true,
		"faces_detected": len(resp.Faces),
		"cluster_label":  winner.label.String(),
		"cluster_name":   winner.name,
		"similarity":     winner.bestSim,
		"asset_ids":      stringIDs,
		"count":          len(stringIDs),
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// M21: Public Asset Download
// ──────────────────────────────────────────────────────────────────────────────

// PublicAssetDownload handles GET /api/v1/public/galleries/{slug}/assets/{assetId}/download.
// Streams a photographer-allowed download variant from the object store
// (Backblaze B2 by default) for published galleries that have downloads
// enabled. No JWT required — gallery/session access is enforced before bytes
// are returned.
func (h *PublicGalleryHandler) PublicAssetDownload(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}

	assetIDStr := chi.URLParam(r, "assetId")
	assetID, err := uuid.Parse(assetIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid asset id"}`, http.StatusBadRequest)
		return
	}

	gallery, err := h.resolveGalleryForRequest(r, slug)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}
	if !h.requirePublicGallerySession(w, r, gallery) {
		return
	}

	// M19 F-009: Gallery expiry enforcement
	if gallery.ExpiresAt != nil && gallery.ExpiresAt.Before(time.Now().UTC()) {
		http.Error(w, `{"error":"gallery expired"}`, http.StatusGone)
		return
	}

	if !gallery.DownloadEnabled {
		http.Error(w, `{"error":"downloads disabled for this gallery"}`, http.StatusForbidden)
		return
	}

	// Verify the asset belongs to this gallery
	galleryAssets, err := h.gallerySvc.ListAssets(r.Context(), gallery.ID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	found := false
	for _, ga := range galleryAssets {
		if ga.AssetID == assetID {
			found = true
			break
		}
	}
	if !found {
		http.Error(w, `{"error":"asset not in gallery"}`, http.StatusNotFound)
		return
	}

	// Fetch asset details
	asset, err := h.assetSvc.GetByID(r.Context(), assetID)
	if err != nil || asset == nil {
		http.Error(w, `{"error":"asset not found"}`, http.StatusNotFound)
		return
	}

	requestedFormat, err := publicDownloadFormatForPolicy(r.URL.Query().Get("format"), gallery.DownloadQuality)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusForbidden)
		return
	}
	variant, err := publicDownloadVariant(asset.Asset, requestedFormat)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusNotFound)
		return
	}

	// Stream file from object storage
	reader, err := h.assetSvc.GetStorageReader(r.Context(), variant.StorageKey)
	if err != nil {
		http.Error(w, `{"error":"file retrieval failed"}`, http.StatusInternalServerError)
		return
	}
	defer reader.Close()

	// 2026-05-18: bake the gallery's text watermark into the download when:
	//   1. The photographer enabled it on /galleries/{id}/settings
	//      (watermark_config.enabled = true with non-empty text)
	//   2. The source content_type is a JPEG/PNG image — stdlib decoders
	//      can't handle RAW (CR2/NEF/ARW) or HEIC, and we don't want to
	//      bake into the WebP/AVIF derivatives either (we serve originals).
	//   3. A watermark service was wired at startup (always true in main.go
	//      since v0.0.51; nil-safe so tests that omit it still pass through).
	if variant.Format == "original" && h.watermarkSvc != nil && service.IsEnabled(gallery.WatermarkConfig) && supportsWatermarkBaking(asset.ContentType) {
		cfg := service.ConfigFromMap(gallery.WatermarkConfig)
		watermarked, werr := h.watermarkSvc.Apply(r.Context(), reader, cfg)
		if werr == nil {
			// The watermark service re-encodes as JPEG. Update headers
			// accordingly so the browser names the file with .jpg and the
			// MIME type matches the bytes being sent. Drop Content-Length
			// — re-encoding changes the byte count and we don't know the
			// new size without buffering the whole stream first.
			outName := watermarkedFilename(asset.Filename)
			w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, outName))
			w.Header().Set("Content-Type", "image/jpeg")
			w.Header().Set("X-Watermarked", "true")
			io.Copy(w, watermarked)
			return
		}
		// Bake failed (decode error, unsupported color profile, etc.) —
		// fall through to the original-stream path below so the download
		// still completes. The watermark is "best effort" on the download
		// path; the public viewer keeps its CSS overlay as a second line.
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, variant.Filename))
	w.Header().Set("Content-Type", variant.ContentType)
	if variant.SizeBytes > 0 {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", variant.SizeBytes))
	}

	io.Copy(w, reader)
}

type publicDownloadSelection struct {
	StorageKey  string
	Filename    string
	ContentType string
	SizeBytes   int64
	Format      string
}

func publicDownloadVariant(asset *repository.Asset, requestedFormat string) (*publicDownloadSelection, error) {
	if asset == nil {
		return nil, fmt.Errorf("asset not found")
	}
	format := strings.ToLower(strings.TrimSpace(requestedFormat))
	if format == "" {
		format = "webp"
	}

	switch format {
	case "original":
		return &publicDownloadSelection{
			StorageKey:  asset.StorageKey,
			Filename:    asset.Filename,
			ContentType: asset.ContentType,
			SizeBytes:   asset.SizeBytes,
			Format:      "original",
		}, nil
	case "webp":
		key := firstThumbnailKey(asset.ThumbnailURLs, "display_webp", "thumb_lg_webp")
		if key == "" {
			return nil, fmt.Errorf("webp version not available")
		}
		return &publicDownloadSelection{
			StorageKey:  key,
			Filename:    replaceExt(asset.Filename, ".webp"),
			ContentType: "image/webp",
			Format:      "webp",
		}, nil
	case "thumbnail":
		key := firstThumbnailKey(asset.ThumbnailURLs, "thumb_lg_webp", "thumb_md_webp", "thumb_sm_webp")
		if key == "" {
			return nil, fmt.Errorf("thumbnail not available")
		}
		return &publicDownloadSelection{
			StorageKey:  key,
			Filename:    "thumb_" + replaceExt(asset.Filename, ".webp"),
			ContentType: "image/webp",
			Format:      "thumbnail",
		}, nil
	default:
		return nil, fmt.Errorf("unsupported download format")
	}
}

func publicDownloadFormatForPolicy(requestedFormat, policy string) (string, error) {
	format := strings.ToLower(strings.TrimSpace(requestedFormat))
	allowed := strings.ToLower(strings.TrimSpace(policy))
	if allowed != "thumbnail" && allowed != "original" {
		// Legacy rows may still contain "both"; the UI no longer offers a
		// mixed policy, so that value collapses to WebP until explicitly reset.
		allowed = "webp"
	}
	if format == "" {
		format = allowed
	}
	if format == allowed {
		return format, nil
	}
	return "", fmt.Errorf("download format not allowed for this gallery")
}

func firstThumbnailKey(thumbnails map[string]string, keys ...string) string {
	for _, key := range keys {
		if value := thumbnails[key]; value != "" {
			return value
		}
	}
	return ""
}

func replaceExt(filename, ext string) string {
	base := strings.TrimSuffix(filename, filepath.Ext(filename))
	if base == "" {
		base = filename
	}
	return base + ext
}

// supportsWatermarkBaking reports whether the asset's content type can be
// decoded by the stdlib image package + imaging library used by
// WatermarkService.Apply. RAW formats (CR2/NEF/ARW/DNG) and HEIC are not
// supported — those downloads stream untouched.
func supportsWatermarkBaking(contentType string) bool {
	switch strings.ToLower(contentType) {
	case "image/jpeg", "image/jpg", "image/pjpeg", "image/png":
		return true
	default:
		return false
	}
}

// watermarkedFilename swaps the original extension for .jpg since the bake
// path re-encodes as JPEG. Preserves the stem ("Wedding (42).NEF" →
// "Wedding (42).jpg") and tolerates dotted filenames.
func watermarkedFilename(name string) string {
	if i := strings.LastIndex(name, "."); i > 0 {
		return name[:i] + ".jpg"
	}
	return name + ".jpg"
}
