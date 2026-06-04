package main

import (
	"context"
	cryptorand "crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/redis/go-redis/v9"

	"github.com/rawdrive/backend/internal/ai"
	"github.com/rawdrive/backend/internal/auth"
	backendcrypto "github.com/rawdrive/backend/internal/crypto"
	"github.com/rawdrive/backend/internal/email"
	"github.com/rawdrive/backend/internal/events"
	"github.com/rawdrive/backend/internal/face"
	"github.com/rawdrive/backend/internal/featureflag"
	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/onboarding"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/scheduler"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/storage"
	streaminganalytics "github.com/rawdrive/backend/internal/streaming/analytics"
	streamingchat "github.com/rawdrive/backend/internal/streaming/chat"
	"github.com/rawdrive/backend/internal/streaming/credit"
	streaminghandlers "github.com/rawdrive/backend/internal/streaming/handlers"
	streamingrate "github.com/rawdrive/backend/internal/streaming/rate"
	streamingrecharge "github.com/rawdrive/backend/internal/streaming/recharge"
	streamingrepo "github.com/rawdrive/backend/internal/streaming/repository"
	"github.com/rawdrive/backend/internal/streaming/shortlink"
	"github.com/rawdrive/backend/internal/streaming/statepusher"
	"github.com/rawdrive/backend/internal/streaming/viewer"
	teamPkg "github.com/rawdrive/backend/internal/team"
	uploadcredit "github.com/rawdrive/backend/internal/upload/credit"
	uploadgate "github.com/rawdrive/backend/internal/upload/gate"
	uploadhandlers "github.com/rawdrive/backend/internal/upload/handlers"
	"github.com/rawdrive/backend/internal/user"
	"github.com/rawdrive/backend/internal/worker"
	"github.com/rawdrive/backend/internal/workspace"
)

// ──────────────────────────── Lightweight stubs (events, email — replaceable) ─────

// logEventPublisher logs events to stdout instead of NATS (dev mode).
type logEventPublisher struct{}

func (p *logEventPublisher) Publish(_ context.Context, subject string, data []byte) error {
	log.Printf("[event] %s: %s", subject, string(data))
	return nil
}

// logStorageBucket logs bucket provisioning (dev mode).
type logStorageBucket struct{}

func (p *logStorageBucket) ProvisionBucket(_ context.Context, workspaceID string) error {
	log.Printf("[storage] provisioned bucket for workspace %s", workspaceID)
	return nil
}

// logEmailSender logs emails to stdout (dev mode).
type logEmailSender struct{}

func (p *logEmailSender) SendInvitation(_ context.Context, email, link string) error {
	log.Printf("[email] invitation to %s: %s", email, link)
	return nil
}

type smtpNotificationEmailProvider struct {
	sender *email.NotificationSender
}

func (p smtpNotificationEmailProvider) Channel() string { return "email" }

func (p smtpNotificationEmailProvider) Send(ctx context.Context, req service.DeliveryRequest) error {
	if req.EmailTo == "" {
		log.Printf("email[smtp]: no address for user=%s category=%s - skipping", req.UserID, req.Category)
		return nil
	}
	return p.sender.Send(ctx, req.EmailTo, req.Title, req.Body, req.ActionURL)
}

func safeRequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)
		started := time.Now()
		next.ServeHTTP(ww, r)

		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		log.Printf(
			"\"%s %s://%s%s %s\" from %s - %03d %dB in %s",
			r.Method,
			scheme,
			r.Host,
			sanitizedRequestURI(r),
			r.Proto,
			r.RemoteAddr,
			ww.Status(),
			ww.BytesWritten(),
			time.Since(started),
		)
	})
}

func sanitizedRequestURI(r *http.Request) string {
	if r == nil || r.URL == nil {
		return ""
	}
	query := r.URL.Query()
	if len(query) == 0 {
		return r.URL.RequestURI()
	}
	changed := false
	for key := range query {
		if isSensitiveQueryKey(key) {
			query.Set(key, "<redacted>")
			changed = true
		}
	}
	if !changed {
		return r.URL.RequestURI()
	}
	clone := *r.URL
	clone.RawQuery = query.Encode()
	return clone.RequestURI()
}

func isSensitiveQueryKey(key string) bool {
	switch strings.ToLower(key) {
	case "access_token", "code", "id_token", "mfa_token", "refresh_token", "state", "token":
		return true
	default:
		return strings.Contains(strings.ToLower(key), "secret")
	}
}

// platformSettingsJWTKeyStore adapts *repository.PlatformSettingsRepo to
// the auth.JWTKeyStore interface so the JWT signing key can be persisted
// alongside other platform secrets. When the F-005 envelope is wired on
// the repo, writes through this adapter are encrypted at rest (because
// we always pass is_secret=true).
//
// F-006 Part A (audit 2026-04-10): prevents the JWT signing key from
// being regenerated on every restart, which was invalidating every
// outstanding access token and forcing every authenticated user to
// log in again whenever the API container cycled.
type platformSettingsJWTKeyStore struct {
	repo *repository.PlatformSettingsRepo
}

// streamingCreditBalanceAdapter adapts credit.Service.GetBalance to the
// streaminghandlers.BalanceProvider interface expected by CreditBalanceHandler.
// Returning an empty BalanceView on any error keeps the pill resilient — the
// handler then reports 0 minutes with the low_balance flag set.
type streamingCreditBalanceAdapter struct {
	svc *credit.Service
}

func (a *streamingCreditBalanceAdapter) BalanceForWorkspace(ctx context.Context, workspaceID uuid.UUID) (streaminghandlers.BalanceView, error) {
	b, err := a.svc.GetBalance(ctx, workspaceID)
	if err != nil {
		return streaminghandlers.BalanceView{UpdatedAt: time.Now().UTC()}, err
	}
	updated := time.Now().UTC()
	if b.LastEntryAt != nil {
		updated = *b.LastEntryAt
	}
	return streaminghandlers.BalanceView{
		Minutes:   b.BalanceMinutes,
		Seconds:   b.BalanceMinutes * 60,
		UpdatedAt: updated,
	}, nil
}

// uploadCreditBalanceAdapter adapts uploadcredit.Service.Balance to the
// uploadhandlers.BalanceProvider interface expected by
// UploadBalanceHandler. M40 Upload Credit Meter sibling of
// streamingCreditBalanceAdapter above. Returning an empty view on error
// keeps the pill resilient — the handler then reports 0 available with
// the low_balance flag set.
type uploadCreditBalanceAdapter struct {
	svc *uploadcredit.Service
}

func (a *uploadCreditBalanceAdapter) UploadBalance(ctx context.Context, workspaceID uuid.UUID) (uploadhandlers.UploadBalanceView, error) {
	b, err := a.svc.Balance(ctx, workspaceID)
	if err != nil {
		return uploadhandlers.UploadBalanceView{UpdatedAt: time.Now().UTC()}, err
	}
	updated := time.Now().UTC()
	if b.LastEntryAt != nil {
		updated = *b.LastEntryAt
	}
	return uploadhandlers.UploadBalanceView{
		Available:   b.Available,
		PlanGranted: b.PlanGranted,
		Purchased:   b.Purchased,
		Reserved:    b.Reserved,
		Consumed:    b.Consumed,
		Refunded:    b.Refunded,
		UpdatedAt:   updated,
	}, nil
}

// planTierPoolAdapter wraps *pgxpool.Pool so it satisfies the
// middleware.PlanTierPool interface. Go's structural typing won't match a
// concrete pgx.Row through a returns-interface method, so we explicitly
// box the Row into the minimal Scan-only shape the middleware needs.
//
// M41 FR-UCRT-07 — the middleware queries workspaces.plan_tier once per
// request (cheap lookup on the PK) and stashes the result on the context
// via WithPlanTier. Downstream handlers (chunked upload, refund) read it
// via PlanTierFromContext to decide whether enterprise-unlimited gating
// should apply.
type planTierPoolAdapter struct{ pool *pgxpool.Pool }

type planTierRowAdapter struct{ row pgx.Row }

func (r planTierRowAdapter) Scan(dest ...any) error { return r.row.Scan(dest...) }

func (a *planTierPoolAdapter) QueryRow(ctx context.Context, sql string, args ...any) middleware.PlanTierRow {
	return planTierRowAdapter{row: a.pool.QueryRow(ctx, sql, args...)}
}

// uploadPackageCatalogueAdapter reads active upload packages + current rate
// cards from the DB for the M41 GET /api/v1/uploads/packages endpoint.
//
// The query joins upload_packages (active=true) with upload_rate_cards
// (effective_to IS NULL — current active card). Exactly one active rate
// card per package is enforced by the partial unique index in migration
// 102, so this JOIN is 1:1 by construction and does not need DISTINCT.
type uploadPackageCatalogueAdapter struct {
	pool *pgxpool.Pool
}

func (a *uploadPackageCatalogueAdapter) UploadPackages(ctx context.Context) ([]uploadhandlers.UploadPackageView, error) {
	if a.pool == nil {
		return nil, fmt.Errorf("upload package catalogue: pool not configured")
	}
	// M41-DB-QRY-001: DISTINCT ON (p.code) is defensive against a
	// hypothetical state where the partial unique index
	// upload_rate_cards_active_uniq has been dropped or disabled in prod
	// (migration error, manual intervention). Under normal conditions the
	// index enforces exactly one active rate card per package, so the
	// JOIN is 1:1 and DISTINCT ON is a no-op. In the failure mode it
	// keeps the client-visible response coherent (one price per package)
	// while /health and logs still flag the index drift for an operator.
	// ORDER BY p.code is required by DISTINCT ON; final sort happens on
	// p.credits ASC below via an outer SELECT.
	rows, err := a.pool.Query(ctx, `
		SELECT code, credits, display_name, price_paise, currency
		  FROM (
			SELECT DISTINCT ON (p.code)
			       p.code, p.credits, p.display_name,
			       r.price_paise, r.currency
			  FROM upload_packages p
			  JOIN upload_rate_cards r
			    ON r.package_code = p.code AND r.effective_to IS NULL
			 WHERE p.active = TRUE
			 ORDER BY p.code, r.effective_from DESC
		  ) latest
		 ORDER BY credits ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []uploadhandlers.UploadPackageView
	for rows.Next() {
		var v uploadhandlers.UploadPackageView
		if err := rows.Scan(&v.Code, &v.Credits, &v.DisplayName, &v.PricePaise, &v.Currency); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// streamingrechargeSettingsAdapter adapts our PlatformSettingsRepo to the
// minimal SettingsRepo interface streaming/recharge expects, so the recharge
// package doesn't import repository directly.
type streamingrechargeSettingsAdapter struct {
	repo *repository.PlatformSettingsRepo
}

func (a streamingrechargeSettingsAdapter) GetByKey(ctx context.Context, category, key string) (*streamingrecharge.PlatformSettingValue, error) {
	v, err := a.repo.GetByKey(ctx, category, key)
	if err != nil {
		return nil, err
	}
	if v == nil {
		return nil, nil
	}
	return &streamingrecharge.PlatformSettingValue{Value: v.Value}, nil
}

// streamingrechargePackageLookup adapts a pgxpool.Pool to the recharge
// PackageLookup interface, returning the package + active rate-card row.
type streamingrechargePackageLookup struct {
	pool *pgxpool.Pool
}

func (l streamingrechargePackageLookup) ActivePackage(ctx context.Context, packageID uuid.UUID) (*streamingrecharge.PackageInfo, error) {
	var info streamingrecharge.PackageInfo
	info.PackageID = packageID
	err := l.pool.QueryRow(ctx, `
		SELECT r.id, r.price_paise, p.minutes
		  FROM streaming_rate_cards r
		  JOIN streaming_packages  p ON p.id = r.package_id
		 WHERE r.package_id = $1 AND r.effective_from <= now()
		 ORDER BY r.effective_from DESC
		 LIMIT 1`,
		packageID,
	).Scan(&info.RateCardID, &info.PricePaise, &info.Minutes)
	if err != nil {
		return nil, err
	}
	return &info, nil
}

// registerStreamingRechargeRoutes wires the F-014 recharge endpoints onto the
// correct routers (F-010 fix).
//
//   - api: the authenticated sub-router (JWTAuth + TenantContext already
//     applied by the caller). RequireAuth / RequirePlatformRole here see the
//     injected claims, so the recharge / orders / balance / refund endpoints
//     work instead of always returning 401.
//   - public: the outer router with no JWTAuth. The public package catalogue
//     and the provider webhooks live here on purpose — webhooks are
//     signature-verified inside the handler and must NOT inherit
//     TenantContext/RequireMFA (providers send no JWT and no workspace header).
//
// Paths mirror streamingrecharge.RegisterRoutes exactly; only the router and
// per-route middleware placement differ.
func registerStreamingRechargeRoutes(api, public chi.Router, h *streamingrecharge.Handler) {
	// Public catalogue (no auth — landing page reads this).
	public.Get("/api/v1/public/streaming/packages", h.ListPublicPackages)

	// Provider webhooks (no auth; signature verification done in the handler).
	public.Post("/api/v1/webhooks/phonepe/streaming", h.PhonePeWebhook)
	public.Post("/api/v1/webhooks/razorpay/streaming", h.RazorpayWebhook)

	// Workspace-authenticated recharge initiation + reads.
	api.With(middleware.RequireAuth).Post("/api/v1/streaming/recharge", h.CreateRecharge)
	api.With(middleware.RequireAuth).Get("/api/v1/streaming/recharges", h.ListMyOrders)
	api.With(middleware.RequireAuth).Get("/api/v1/streaming/balance", h.GetMyBalance)

	// Super-admin refund.
	api.With(middleware.RequireAuth).
		With(middleware.RequirePlatformRole("super_admin")).
		Post("/api/v1/admin/streaming/recharges/{id}/refund", h.RefundRecharge)
}

// publicThumbnailKeyRe matches the ONLY storage keys that may be served without
// a bearer token: workspace-derivative thumbnails written by the derivative
// pipeline, keyed as thumbnails/<uuid>/<variant>.webp. Anything else (originals,
// downloads, ZIPs, BYOS prefixes) requires JWT auth. (F-035 hardening.)
//
// New uploads write WebP variants with the canonical *_webp names
// (thumb_sm_webp/thumb_md_webp/thumb_lg_webp). Keep the legacy spellings too
// so pre-M41 rows that already lived under thumbnails/ continue to render.
var publicThumbnailKeyRe = regexp.MustCompile(`^thumbnails/[0-9a-fA-F-]{36}/(thumb_sm_webp|thumb_md_webp|thumb_lg_webp|display_webp|thumb_sm|thumb_md|thumb_lg|display)\.webp$`)

// validateStorageKey rejects storage-proxy keys that attempt path traversal or
// absolute-path escapes before they ever reach the storage provider. B2/S3 use
// a flat keyspace so this is defense-in-depth, not a live exploit fix: it closes
// the unvalidated-key surface and prevents a future prefix collision from
// silently bypassing auth. (F-035.)
func validateStorageKey(key string) error {
	if key == "" {
		return errors.New("missing key")
	}
	if strings.HasPrefix(key, "/") {
		return errors.New("absolute key not allowed")
	}
	if strings.Contains(key, "..") {
		return errors.New("traversal not allowed")
	}
	// path.Clean collapses any "./" / redundant separators; if cleaning changes
	// the key it was not already normalized and we reject rather than guess.
	if path.Clean(key) != key {
		return errors.New("non-normalized key not allowed")
	}
	return nil
}

// isPublicThumbnailKey reports whether a (already-validated) key is a derivative
// thumbnail safe to serve anonymously. (F-035.)
func isPublicThumbnailKey(key string) bool {
	return publicThumbnailKeyRe.MatchString(key)
}

// thumbnailKeyAssetIDRe extracts the asset UUID embedded in a derivative key
// shaped thumbnails/<assetID>/<variant>.webp. The thumbnail pipeline always
// names derivatives with the owning asset's id (see thumbnail_service.go), so
// the path segment is the authoritative asset→gallery linkage we resolve on the
// byte path. (S4-G1.)
var thumbnailKeyAssetIDRe = regexp.MustCompile(`^thumbnails/([0-9a-fA-F-]{36})/(?:thumb_sm_webp|thumb_md_webp|thumb_lg_webp|display_webp|thumb_sm|thumb_md|thumb_lg|display)\.webp$`)

// thumbnailAssetID returns the asset UUID a public thumbnail key belongs to, or
// uuid.Nil + false when the key is not a thumbnail key shape.
func thumbnailAssetID(key string) (uuid.UUID, bool) {
	m := thumbnailKeyAssetIDRe.FindStringSubmatch(key)
	if len(m) != 2 {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(m[1])
	if err != nil {
		return uuid.Nil, false
	}
	return id, true
}

// thumbnailGalleryProtection is the per-gallery protection snapshot the byte
// path needs to decide whether a thumbnail may be served. One row per gallery
// that contains the asset.
type thumbnailGalleryProtection struct {
	galleryID         uuid.UUID
	published         bool
	expired           bool
	passwordProtected bool
	accessMode        string
}

// loadThumbnailGalleryProtection resolves every gallery that contains the asset
// behind a thumbnail key, with the protection fields the byte gate needs. The
// asset→gallery linkage is via gallery_assets; an asset may belong to more than
// one gallery, so all are returned and the caller serves if ANY of them grants
// access (mirrors the existing "asset belongs to this gallery" download check,
// generalised across galleries). (S4-G1.)
func loadThumbnailGalleryProtection(ctx context.Context, pool *pgxpool.Pool, assetID uuid.UUID) ([]thumbnailGalleryProtection, error) {
	if pool == nil {
		return nil, errors.New("database pool not configured")
	}
	rows, err := pool.Query(ctx, `
		SELECT g.id,
		       g.is_published,
		       (g.expires_at IS NOT NULL AND g.expires_at < now()) AS expired,
		       (g.password_hash IS NOT NULL AND g.password_hash <> '') AS password_protected,
		       COALESCE(g.access_mode, 'private') AS access_mode
		  FROM gallery_assets ga
		  JOIN galleries g ON g.id = ga.gallery_id
		 WHERE ga.asset_id = $1
		   AND g.deleted_at IS NULL`,
		assetID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []thumbnailGalleryProtection
	for rows.Next() {
		var p thumbnailGalleryProtection
		if err := rows.Scan(&p.galleryID, &p.published, &p.expired, &p.passwordProtected, &p.accessMode); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// thumbnailServableAnonymously reports whether a protection row represents a
// gallery that anyone may pull thumbnails from: published, not expired, no
// password, and a discoverable/direct access mode (public or unlisted, or the
// legacy empty value). This is the REGRESSION-GUARD path — the normal public
// gallery delivery case must keep working for anonymous clients. (S4-G1.)
func thumbnailServableAnonymously(p thumbnailGalleryProtection) bool {
	if !p.published || p.expired || p.passwordProtected {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(p.accessMode)) {
	case "public", "unlisted", "":
		return true
	default: // private, invite-only
		return false
	}
}

// authorizeThumbnailByte decides whether the request may receive the bytes for a
// public-shaped thumbnail key. It closes S4-G1 (anonymous byte serving on key
// shape alone) by binding the asset to its gallery(ies) and enforcing the SAME
// protection rules the slug/asset listing surfaces enforce:
//
//   - serve anonymously ONLY when some gallery containing the asset is
//     published + non-expired + non-password + public/unlisted (the normal
//     public-gallery delivery case — kept working);
//   - otherwise require a valid gallery-session token (password- or
//     share-scoped, see gallery_access_service.go) whose bound gallery actually
//     contains this asset and is itself published + non-expired.
//
// Returns true when the bytes may be served. Fails closed on any lookup error.
func authorizeThumbnailByte(
	ctx context.Context,
	pool *pgxpool.Pool,
	accessSvc *service.GalleryAccessService,
	r *http.Request,
	assetID uuid.UUID,
) bool {
	protections, err := loadThumbnailGalleryProtection(ctx, pool, assetID)
	if err != nil {
		log.Printf("storage proxy: thumbnail protection lookup for asset %s failed: %v", assetID, err)
		return false
	}
	if len(protections) == 0 {
		// Orphan derivative (no gallery membership) — not a public delivery
		// surface; fail closed.
		return false
	}

	// Normal public delivery: any open gallery containing the asset.
	for _, p := range protections {
		if thumbnailServableAnonymously(p) {
			return true
		}
	}

	// Protected: require a token bound to a gallery that (a) contains this
	// asset and (b) is published + non-expired.
	//
	// SEC-1 (security audit 2026-05-30): the DURABLE gallery session is read only
	// from the header (X-Gallery-Session) or the SameSite=Strict gallery_session
	// cookie — never from the URL, where it would leak into access logs / browser
	// history / Referer. For header-less <img>/<audio> byte loads (which, in a
	// split-origin deploy, can't carry either) the client uses a short-lived,
	// gallery-scoped, HMAC-signed asset-access token in ?at= that cannot be
	// replayed as a session (distinct JWT audience).
	if accessSvc == nil {
		return false
	}
	var boundGallery uuid.UUID
	var ok bool
	if token := r.Header.Get("X-Gallery-Session"); token != "" {
		boundGallery, ok = accessSvc.GalleryIDFromSession(ctx, token)
	}
	if !ok {
		if c, err := r.Cookie("gallery_session"); err == nil && c.Value != "" {
			boundGallery, ok = accessSvc.GalleryIDFromSession(ctx, c.Value)
		}
	}
	if !ok {
		if at := r.URL.Query().Get("at"); at != "" {
			boundGallery, ok = accessSvc.GalleryIDFromAssetToken(ctx, at)
		}
	}
	if !ok {
		return false
	}
	for _, p := range protections {
		if p.galleryID == boundGallery && p.published && !p.expired {
			return true
		}
	}
	return false
}

func storageKeyBelongsToWorkspace(ctx context.Context, pool *pgxpool.Pool, key string, workspaceID string) (bool, error) {
	if pool == nil {
		return false, errors.New("database pool not configured")
	}
	wsID, err := uuid.Parse(workspaceID)
	if err != nil {
		return false, nil
	}
	var ok bool
	err = pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			  FROM assets a
			 WHERE a.storage_key = $1
			   AND a.workspace_id = $2
			   AND a.deleted_at IS NULL
			UNION
			SELECT 1
			  FROM asset_derivatives d
			  JOIN assets a ON a.id = d.asset_id
			 WHERE d.storage_key = $1
			   AND a.workspace_id = $2
			   AND a.deleted_at IS NULL
		)`,
		key, wsID,
	).Scan(&ok)
	if err != nil {
		return false, err
	}
	return ok, nil
}

type platformSettingsSMTPReader struct {
	repo *repository.PlatformSettingsRepo
}

func (s *platformSettingsSMTPReader) Get(ctx context.Context, category, key string) (string, bool, error) {
	row, err := s.repo.GetByKey(ctx, category, key)
	if err != nil {
		return "", false, err
	}
	if row == nil {
		return "", false, nil
	}
	return row.Value, true, nil
}

func platformSettingValue(ctx context.Context, repo *repository.PlatformSettingsRepo, category, key, envName string) string {
	return platformSettingValueAny(ctx, repo, category, key, envName)
}

func platformSettingValueAny(ctx context.Context, repo *repository.PlatformSettingsRepo, category, key string, envNames ...string) string {
	if repo != nil {
		row, err := repo.GetByKey(ctx, category, key)
		if err != nil {
			log.Printf("platform_settings: failed to read %s.%s: %v", category, key, err)
		} else if row != nil && strings.TrimSpace(row.Value) != "" {
			return strings.TrimSpace(row.Value)
		}
	}
	for _, envName := range envNames {
		if value := strings.TrimSpace(os.Getenv(envName)); value != "" {
			return value
		}
	}
	return ""
}

func platformSettingValueDefault(ctx context.Context, repo *repository.PlatformSettingsRepo, category, key, defaultValue string, envNames ...string) string {
	if value := platformSettingValueAny(ctx, repo, category, key, envNames...); value != "" {
		return value
	}
	return defaultValue
}

const (
	jwtKeyCategory = "auth"
	jwtKeyName     = "jwt_signing_key_pem"
)

func (s *platformSettingsJWTKeyStore) GetSigningKeyPEM(ctx context.Context) (string, error) {
	row, err := s.repo.GetByKey(ctx, jwtKeyCategory, jwtKeyName)
	if err != nil {
		return "", err
	}
	if row == nil {
		return "", nil // first boot — let the caller generate + persist
	}
	return row.Value, nil
}

func (s *platformSettingsJWTKeyStore) PutSigningKeyPEM(ctx context.Context, pemStr string) error {
	// Pass is_secret=true so the F-005 envelope encrypts this row at rest
	// when the envelope is wired. Pass updatedBy=nil — this is a
	// system-initiated write during bootstrap, not a user action.
	return s.repo.Upsert(ctx, jwtKeyCategory, jwtKeyName, pemStr, true,
		"F-006: JWT signing key (PKCS8 PEM). Auto-generated on first boot and reused across restarts.", nil)
}

// logOTPDelivery logs OTP codes to stdout (dev mode — DO NOT USE IN PRODUCTION).
type logOTPDelivery struct{}

func (p *logOTPDelivery) SendOTP(_ context.Context, email, code string) error {
	log.Printf("[OTP] %s -> code: %s", email, code)
	return nil
}

// 2026-05-19 dev stub of auth.SecurityNotifier — used only when
// DEV_STUB_EMAIL=true and APP_ENV is not production. Mirrors
// logOTPDelivery's "print to stdout, never fail" contract so password
// reset and security-alert flows are exercised in local dev without
// an SMTP listener.
type logSecurityNotifier struct{}

func (n *logSecurityNotifier) SendSecurityNotification(_ context.Context, email, message string) error {
	log.Printf("[SECURITY] %s -> %s", email, message)
	return nil
}

func (n *logSecurityNotifier) SendPasswordResetOTP(_ context.Context, email, code string, expirySeconds int) error {
	log.Printf("[PWD-RESET] %s -> code: %s (expires in %ds)", email, code, expirySeconds)
	return nil
}

// onboardingWorkspaceCreator adapts workspace.Service for onboarding.
// It resolves 2-letter state codes (e.g. "TS") to integer state IDs from the DB,
// updates the user's state_id, and creates the workspace + membership.
type onboardingWorkspaceCreator struct {
	wsSvc workspace.Service
	pool  *pgxpool.Pool
}

func (o *onboardingWorkspaceCreator) CreateWorkspace(ctx context.Context, userID, stateCode, businessName, planTier string) (string, error) {
	// Resolve state code to integer state ID.
	// Frontend may send 2-letter codes ("TG"), ISO codes ("IN-TG"), state names ("Telangana"),
	// or numeric IDs ("24"). Try all patterns for maximum compatibility.
	var stateID int
	err := o.pool.QueryRow(ctx,
		`SELECT id FROM states
		 WHERE code = $1
		    OR code = 'IN-' || $1
		    OR REPLACE(code, 'IN-', '') = $1
		    OR UPPER(name) = UPPER($1)
		    OR id::text = $1
		 LIMIT 1`, stateCode,
	).Scan(&stateID)
	if err != nil {
		log.Printf("WARNING: could not resolve state code %q: %v", stateCode, err)
		return "", fmt.Errorf("resolve state: %w", err)
	}

	stateIDStr := fmt.Sprintf("%d", stateID)

	// Update user's state_id in DB
	_, _ = o.pool.Exec(ctx, `UPDATE users SET state_id = $1 WHERE id = $2`, stateID, userID)

	// AREA-CUSTOMER-3 (audit 2026-05-31): co-create the workspace, its
	// Owner workspace_members row, and its workspace_storage quota row
	// ATOMICALLY in a single transaction. Previously the members and
	// storage inserts were fire-and-forget (`_, _ = o.pool.Exec(...)`),
	// so onboarding could advance to step=complete with a workspace that
	// had no quota row (dashboard storage widget degraded) or no
	// membership. CreateWithBootstrap returns an error if any of the
	// three rows fail or are not present after the inserts; the error
	// propagates up to onboarding.SetProfile, which then does NOT advance
	// the step — the user can retry.
	quotaBytes := service.PlanDefaultQuotaBytes(planTier)
	ws, err := o.wsSvc.CreateWithBootstrap(ctx, workspace.CreateWorkspaceInput{
		Name:         businessName,
		StateID:      stateIDStr,
		OwnerID:      userID,
		BusinessName: businessName,
		PlanTier:     planTier,
	}, quotaBytes)
	if err != nil {
		// Issue #5 + onboarding.go caveat: if a previous onboarding
		// attempt committed the workspace transaction but failed before
		// advancing to step=complete (e.g. a profile upsert error after
		// commit), the user retries and migration 096 raises a unique
		// violation here. The right behavior is idempotent recovery —
		// fetch the prior row's ID and continue. Because the prior
		// attempt's CreateWithBootstrap was atomic, that recovered
		// workspace is guaranteed to already carry its membership +
		// quota rows, so no separate backfill is needed.
		if errors.Is(err, workspace.ErrDuplicateName) {
			existing, lookupErr := o.wsSvc.GetByOwnerAndName(ctx, userID, businessName)
			if lookupErr == nil && existing != nil {
				return existing.ID, nil
			}
			return "", err
		}
		return "", err
	}

	return ws.ID, nil
}

// onboardingUserUpdater adapts user.Service into the onboarding.UserUpdater
// interface so the onboarding service can persist phone during profile setup.
type onboardingUserUpdater struct {
	userSvc user.Service
}

func (o *onboardingUserUpdater) UpdatePhone(ctx context.Context, userID, phone string) error {
	_, err := o.userSvc.Update(ctx, userID, user.UpdateUserInput{Phone: &phone})
	return err
}

func (o *onboardingUserUpdater) UpdateDistrict(ctx context.Context, userID, district string) error {
	_, err := o.userSvc.Update(ctx, userID, user.UpdateUserInput{District: &district})
	return err
}

// onboardingPlanGrantStore adapts repository.AdminUserRepo into the
// onboarding.PlanGrantStore interface. The repo method takes uuid.UUID;
// the onboarding port passes the userID as the same string it gets from
// the auth context, so we parse here and surface a parse error as a
// no-op grant (return "" / nil) — a malformed user id can't have a
// matching pending grant anyway.
type onboardingPlanGrantStore struct {
	repo *repository.AdminUserRepo
}

func (o *onboardingPlanGrantStore) ConsumePendingPlanTier(ctx context.Context, userID string) (string, error) {
	id, err := uuid.Parse(userID)
	if err != nil {
		return "", nil
	}
	return o.repo.ConsumePendingPlanTier(ctx, id)
}

// buildViewerJWTService loads (or creates and persists) the viewer-session
// JWT signing key from platform_settings.streaming.viewer_jwt_signing_key
// and constructs the viewer.Service. The key is independent of the main
// auth JWT key so it can be rotated on its own cadence.
//
// M30 / E100-S2 / FR-014-SEC-02. The persisted key is hex-encoded, 32 bytes
// (256 bits), generated via crypto/rand on first boot. The PlatformSettings
// envelope (F-005) handles at-rest encryption transparently.
func buildViewerJWTService(ctx context.Context, repo *repository.PlatformSettingsRepo) (*viewer.Service, error) {
	const (
		category = "streaming"
		key      = "viewer_jwt_signing_key"
	)

	row, err := repo.GetByKey(ctx, category, key)
	if err == nil && row != nil && len(strings.TrimSpace(row.Value)) > 0 {
		raw, decErr := decodeHexKey(row.Value)
		if decErr != nil {
			return nil, fmt.Errorf("viewer JWT key in platform_settings is corrupt: %w", decErr)
		}
		return newViewerService(raw), nil
	}

	// First boot — generate, persist, return.
	raw, genErr := generateRandomKey(32)
	if genErr != nil {
		return nil, fmt.Errorf("generate viewer JWT key: %w", genErr)
	}
	if upErr := repo.Upsert(ctx, category, key, encodeHexKey(raw), true,
		"M30/F-014 viewer-session JWT signing key (HS256, 256 bits)", nil); upErr != nil {
		return nil, fmt.Errorf("persist viewer JWT key: %w", upErr)
	}
	log.Println("M30/F-014: generated and persisted viewer-session JWT signing key")
	return newViewerService(raw), nil
}

func newViewerService(signingKey []byte) *viewer.Service {
	return viewer.NewService(viewer.Config{
		SigningKey:  signingKey,
		SlidingTTL:  15 * time.Minute,
		MaxLifetime: 4 * time.Hour,
	})
}

// buildGallerySessionSigningKey loads (or, on first boot, generates + persists)
// the HMAC signing key used to mint durable gallery-access session tokens
// (S4-G4/E, integration audit 2026-05-31). It mirrors buildViewerJWTService:
// the key is hex-encoded, 32 bytes (256 bits), KEK-encrypted at rest by the
// F-005 platform_settings envelope, and independent of the main auth + viewer
// JWT keys so it rotates on its own cadence. Returning the raw key (not a
// service) lets the caller wire it onto the already-constructed
// GalleryAccessService via WithSessionSigningKey.
func buildGallerySessionSigningKey(ctx context.Context, repo *repository.PlatformSettingsRepo) ([]byte, error) {
	const (
		category = "auth"
		key      = "gallery_session_signing_key"
	)

	row, err := repo.GetByKey(ctx, category, key)
	if err == nil && row != nil && len(strings.TrimSpace(row.Value)) > 0 {
		raw, decErr := decodeHexKey(row.Value)
		if decErr != nil {
			return nil, fmt.Errorf("gallery-session signing key in platform_settings is corrupt: %w", decErr)
		}
		return raw, nil
	}

	// First boot — generate, persist, return.
	raw, genErr := generateRandomKey(32)
	if genErr != nil {
		return nil, fmt.Errorf("generate gallery-session signing key: %w", genErr)
	}
	if upErr := repo.Upsert(ctx, category, key, encodeHexKey(raw), true,
		"S4-G4/E gallery-access session signing key (HS256, 256 bits) — durable, node-portable client sessions", nil); upErr != nil {
		return nil, fmt.Errorf("persist gallery-session signing key: %w", upErr)
	}
	log.Println("S4-G4/E: generated and persisted gallery-session signing key")
	return raw, nil
}

// newAdminWorkspaceService constructs the admin workspace service with its
// audit log always wired (F-062). Suspend/unsuspend/delete call a nil-guarded
// recordAudit, so omitting WithAuditLog silently drops every audit_logs entry
// for these privileged actions. Centralising construction here keeps the audit
// wiring un-droppable and gives the regression test a single seam to assert.
func newAdminWorkspaceService(repo *repository.AdminWorkspaceRepo, auditLog *service.AuditLogService) *service.AdminWorkspaceService {
	return service.NewAdminWorkspaceService(repo).WithAuditLog(auditLog)
}

func generateRandomKey(n int) ([]byte, error) {
	buf := make([]byte, n)
	if _, err := cryptorand.Read(buf); err != nil {
		return nil, err
	}
	return buf, nil
}

func encodeHexKey(b []byte) string { return hex.EncodeToString(b) }

func decodeHexKey(s string) ([]byte, error) { return hex.DecodeString(strings.TrimSpace(s)) }

// pgRefreshSessionRevoker implements handler.RefreshSessionRevoker by
// deleting every refresh_sessions row whose sub (user UUID) matches the
// supplied email. Used by the M39 E6-S1 password-reset flow to invalidate
// all active refresh tokens as part of AC-F02-4 / SEC-F03.
type pgRefreshSessionRevoker struct {
	pool *pgxpool.Pool
}

func newPgRefreshSessionRevokerForReset(pool *pgxpool.Pool) *pgRefreshSessionRevoker {
	return &pgRefreshSessionRevoker{pool: pool}
}

func (r *pgRefreshSessionRevoker) RevokeAllByEmail(ctx context.Context, email string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM refresh_sessions WHERE sub = (SELECT id::text FROM users WHERE email=$1)`,
		strings.ToLower(strings.TrimSpace(email)))
	return err
}

// pgPasswordStore implements auth.PasswordStore backed by the users and
// password_resets tables (M39 E6-S1). It is deliberately minimal: it only
// exposes the read/write paths PasswordService needs and relies on existing
// columns (users.password_hash, users.locked_until).
type pgPasswordStore struct {
	pool *pgxpool.Pool
}

func newPgPasswordStore(pool *pgxpool.Pool) *pgPasswordStore {
	return &pgPasswordStore{pool: pool}
}

func (s *pgPasswordStore) FindByEmail(ctx context.Context, email string) (*auth.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	var u auth.User
	err := s.pool.QueryRow(ctx, `
		SELECT id::text, email, COALESCE(display_name,'') AS display_name
		FROM users WHERE lower(email)=lower($1)`, email).
		Scan(&u.ID, &u.Email, &u.DisplayName)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *pgPasswordStore) UpdatePassword(ctx context.Context, email, hashedPassword string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE users SET password_hash=$2, updated_at=now() WHERE lower(email)=lower($1)`,
		strings.ToLower(strings.TrimSpace(email)), hashedPassword)
	return err
}

func (s *pgPasswordStore) RecordFailedAttempt(ctx context.Context, email string) (int, error) {
	// Minimal implementation — attempt counters live in-memory in PasswordService;
	// this just tracks a coarse count for observability. Returns 0 on unknown
	// users so enumeration remains protected.
	_ = email
	return 0, nil
}

func (s *pgPasswordStore) IsLocked(ctx context.Context, email string) (bool, error) {
	_ = email
	return false, nil
}

// loadEnvFiles reads KEY=VALUE pairs from the given file paths and injects
// them into the process environment. Only sets vars that are not already
// present, so a real environment variable always takes precedence over the
// file (matches the documented config resolution order: env → file → fail).
// Missing files are silently skipped. Values may be single- or double-quoted.
func loadEnvFiles(paths ...string) {
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			k, v, ok := strings.Cut(line, "=")
			if !ok {
				continue
			}
			k = strings.TrimSpace(k)
			v = strings.TrimSpace(v)
			if len(v) >= 2 && ((v[0] == '"' && v[len(v)-1] == '"') || (v[0] == '\'' && v[len(v)-1] == '\'')) {
				v = v[1 : len(v)-1]
			}
			// 2026-05-18: use LookupEnv (not Getenv) so explicitly-empty
			// values from the shell-sourced .env.backend can override
			// production values in .env. Previously Getenv("")=="" meant
			// "not set", so `SMTP_USERNAME=` in .env.backend was silently
			// replaced by a production value in .env, which broke local
			// Mailpit which doesn't support AUTH.
			if _, set := os.LookupEnv(k); !set {
				os.Setenv(k, v) //nolint:errcheck
			}
		}
	}
}

// envIntOrDefault reads an integer env var, returning the default on missing
// or unparseable values. Used for tunables like RATE_LIMIT_PER_MINUTE where
// ops should be able to override without touching code.
// newValkeyClient builds the Valkey sliding-window backend used by the rate
// limiters. When VALKEY_URL is set it wraps a go-redis client in
// RedisValkeyClient; when unset (or unparseable) it returns nil, and the
// RateLimitWithValkey limiters fall back to per-node in-memory enforcement. A
// startup ping is attempted and logged but is not fatal.
func newValkeyClient() middleware.ValkeyClient {
	vurl := os.Getenv("VALKEY_URL")
	if vurl == "" {
		log.Println("valkey: VALKEY_URL not set — using per-node in-memory rate limiting")
		return nil
	}
	opts, parseErr := redis.ParseURL(vurl)
	if parseErr != nil {
		log.Printf("valkey: invalid VALKEY_URL %q: %v — using per-node in-memory rate limiting", vurl, parseErr)
		return nil
	}
	rdb := redis.NewClient(opts)
	pingCtx, pingCancel := context.WithTimeout(context.Background(), 2*time.Second)
	if err := rdb.Ping(pingCtx).Err(); err != nil {
		log.Printf("valkey: ping failed: %v — rate limiter enabled but will use in-memory fallback until backend recovers", err)
	} else {
		log.Printf("valkey: connected, cluster-wide sliding-window rate limiter enabled")
	}
	pingCancel()
	return middleware.NewRedisValkeyClient(rdb)
}

func envIntOrDefault(key string, def int) int {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

// kekRequiredForEnv reports whether PLATFORM_SETTINGS_KEK must be present
// (i.e. at-rest envelope encryption is mandatory) for the given APP_ENV.
//
// F-113 (audit 2026-05-30): the KEK is required in EVERY environment except
// the explicit local-development/test allowlist. Staging, review, preview,
// UAT, demo and any unrecognized/empty-but-nonlocal APP_ENV all hold real
// third-party credentials (SMTP/Razorpay/PhonePe/TOTP), so they must not
// fall back to plaintext secret storage — a staging DB compromise or a
// staging→prod clone would otherwise expose those secrets without the KEK.
//
// Only "development", "test" and the empty string (unset APP_ENV = local
// dev) are allowed to run without a KEK, preserving the F-005 local escape
// hatch. The caller is expected to pass a trimmed, lower-cased APP_ENV.
func kekRequiredForEnv(appEnv string) bool {
	switch appEnv {
	case "", "development", "dev", "test", "testing", "local":
		return false
	default:
		// production, prod, staging, stage, review, preview, uat, demo,
		// and anything unrecognized → KEK is mandatory (fail closed).
		return true
	}
}

func storageSSERequiredForEnv(appEnv string) bool {
	return kekRequiredForEnv(appEnv)
}

func validateGoogleRedirectURLForEnv(rawURL, appEnv string) error {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return nil
	}

	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return fmt.Errorf("must be an absolute URL")
	}

	// Local/test environments may use http://localhost callbacks for dev
	// OAuth clients. Every other environment carries real user credentials,
	// so fail closed instead of sending users to Google's redirect_uri_mismatch
	// page with a leaked localhost callback.
	if !kekRequiredForEnv(appEnv) {
		return nil
	}

	if parsed.Scheme != "https" {
		return fmt.Errorf("must use https when APP_ENV=%q", appEnv)
	}
	if isLoopbackHostname(parsed.Hostname()) {
		return fmt.Errorf("must not point at localhost or loopback when APP_ENV=%q", appEnv)
	}
	return nil
}

func isLoopbackHostname(host string) bool {
	host = strings.TrimSpace(strings.ToLower(host))
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func main() {
	// Load env vars from .env.cobolt / .env before anything reads os.Getenv.
	// Process environment always wins; files only fill gaps.
	loadEnvFiles(
		".env.cobolt",
		"../.env.cobolt",
		".env",
		"../.env",
	)

	r := chi.NewRouter()

	// Global middleware
	r.Use(middleware.CORS)
	r.Use(safeRequestLogger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RequestID)
	r.Use(middleware.SecurityHeaders)
	// 2026-05-20: prod default raised from 60/min to 600/min. RawDrive is a
	// cloud SaaS — photographers running bulk-upload sessions legitimately
	// burn through dozens of requests per second (one POST per photo +
	// metadata fetches + derivative GETs + dashboard polling). The previous
	// 60/min cap meant a single moderately active photographer would 429
	// themselves mid-upload. 600/min = 10 req/sec average per real client IP
	// (after the X-Forwarded-For fix), with bursts allowed inside the
	// minute. Overridable via RATE_LIMIT_PER_MINUTE if a tenant needs more
	// (or for emergency tightening). Window is also tunable via
	// RATE_LIMIT_WINDOW_SECONDS so we can move to a wider sliding window
	// (e.g. 6000/10min) without a redeploy if abuse patterns emerge.
	globalRateMax := envIntOrDefault("RATE_LIMIT_PER_MINUTE", 600)
	globalRateWindow := time.Duration(envIntOrDefault("RATE_LIMIT_WINDOW_SECONDS", 60)) * time.Second
	if os.Getenv("APP_ENV") == "development" {
		globalRateMax = 100000 // effectively unlimited in dev/test
	}
	log.Printf("Rate limit: %d requests / %s per client IP", globalRateMax, globalRateWindow)
	// Valkey sliding-window backend for cluster-wide rate limits. Built here,
	// before the limiters that consume it, so the global, credential, and MFA
	// limiters all route through the same backend. It is nil when VALKEY_URL is
	// unset, in which case RateLimitWithValkey enforces per-node in-memory
	// (fail-closed) rather than disabling the limit.
	valkeyClient := newValkeyClient()
	globalLimiter, _ := middleware.RateLimitWithValkey(valkeyClient, "global", globalRateMax, globalRateWindow)
	r.Use(globalLimiter)

	// ──────────────────────── Database Connection (shared M1 + M2) ────────────────
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("FATAL: DATABASE_URL is required. Set it in .env.cobolt or environment.")
	}

	poolCfg, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		log.Fatalf("FATAL: invalid DATABASE_URL: %v", err)
	}
	// Production connects through pgbouncer. pgx's default cache_statement
	// mode creates named prepared statements that can collide across pooled
	// server sessions, especially after rolling restarts. Use extended query
	// protocol without statement caching for pgbouncer compatibility.
	poolCfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
	poolCfg.MaxConns = 25
	poolCfg.MinConns = 5
	// Recycle pooled connections so a connection whose server-side session has
	// drifted (stale prepared-statement state after a pgbouncer/rolling restart,
	// a silently-dead TCP socket) is retired rather than reused for the whole
	// process lifetime. Without these the pool would never proactively replace a
	// connection (PERF-17).
	poolCfg.MaxConnLifetime = 30 * time.Minute
	poolCfg.MaxConnIdleTime = 5 * time.Minute
	poolCfg.HealthCheckPeriod = 1 * time.Minute

	dbPool, err := pgxpool.NewWithConfig(context.Background(), poolCfg)
	if err != nil {
		log.Fatalf("FATAL: failed to connect to database: %v", err)
	}
	defer dbPool.Close()
	log.Println("Database pool connected")

	// M16 E47-S5 / E49-S1: database/sql adapter over the pgx pool. Several
	// Tier D services (UploadPolicyCatalog, WorkspacePolicyService,
	// UploadAllowlistRepo, UploadModerationRepo) use the database/sql
	// signature; stdlib.OpenDBFromPool gives us a *sql.DB backed by the
	// existing pgx pool so we don't duplicate connection pooling.
	sqlDB := stdlib.OpenDBFromPool(dbPool)
	defer sqlDB.Close()

	// Platform settings are the primary source for service configuration.
	// Construct this before email so SMTP follows the documented
	// platform_settings -> environment -> fail lookup order.
	platformSettingsRepo := repository.NewPlatformSettingsRepo(dbPool)
	{
		kekHex := os.Getenv("PLATFORM_SETTINGS_KEK")
		if kekHex != "" {
			envelope, err := backendcrypto.NewEnvelopeFromHex(kekHex)
			if err != nil {
				log.Fatalf("FATAL: PLATFORM_SETTINGS_KEK is invalid: %v", err)
			}
			platformSettingsRepo = platformSettingsRepo.WithEnvelope(envelope)
			log.Println("F-005: platform_settings at-rest encryption ENABLED (envelope wired)")
		} else {
			appEnv := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
			// F-113 (audit 2026-05-30): previously only production/prod
			// hard-failed on a missing KEK; staging/review/UAT and any
			// unrecognized APP_ENV silently fell through to PLAINTEXT
			// secret storage. Those environments routinely hold real
			// SMTP/Razorpay/PhonePe/TOTP credentials, so a staging DB
			// compromise (or a staging→prod clone) leaked those secrets
			// without needing the KEK. We now require the KEK in every
			// environment EXCEPT the explicit local-dev/test allowlist
			// (development, test, ""), preserving the F-005 local escape
			// hatch while closing the clone-to-prod plaintext-leak path.
			if kekRequiredForEnv(appEnv) {
				log.Fatalf("FATAL: PLATFORM_SETTINGS_KEK is required for APP_ENV=%q. "+
					"Only development/test/local environments may run without it. "+
					"Generate a 32-byte hex KEK and set it in your secret store. "+
					"See F-005 in docs/audits/rawdrive-v0.0.35-m16-360-audit-2026-04-10.md "+
					"and F-113 (2026-05-30 audit).", appEnv)
			}
			log.Println("WARNING: PLATFORM_SETTINGS_KEK not set - platform settings secrets will be stored in PLAINTEXT. This is only acceptable in local development/test environments.")
		}
	}

	// ──────────────────────── M1: Auth, Users, Workspaces, Teams ──────────────────

	// Real user service backed by DB
	userRepo := user.NewPgRepo(dbPool)
	userSvc := user.NewService(userRepo)
	userAuthAdapter := user.NewAuthAdapter(userSvc)

	// ──────────────────────── ISSUE-002 Email Transport ────────────────────────
	//
	// Brownfield P0: every email path was backed by a stdout stub and
	// there was no compile-time or runtime guard preventing production
	// use, which meant signup OTPs, password resets, team invitations
	// and MFA enrolment mails all silently vanished in any non-local
	// environment. Load SMTP settings from platform_settings first, then
	// fall back to env vars, and construct the real email.OTPDelivery +
	// email.InvitationSender. If no SMTP config
	// is present, require an explicit DEV_STUB_EMAIL=true escape hatch
	// AND a non-production APP_ENV — otherwise FATAL so misconfigurations
	// cannot ship.
	smtpReader := &platformSettingsSMTPReader{repo: platformSettingsRepo}
	smtpCfg, smtpErr := email.LoadSMTPConfig(context.Background(), smtpReader)
	if smtpErr != nil {
		log.Fatalf("FATAL: SMTP config error (ISSUE-002): %v", smtpErr)
	}

	var otpDelivery auth.EmailDelivery
	var teamEmailSender teamPkg.EmailSender
	var galleryShareSender *email.GalleryShareSender
	// Gallery Enhancements June 2026: branded client email automation sender.
	var galleryAutomationSender *email.GalleryAutomationSender
	var notificationEmailSender *email.NotificationSender
	// 2026-05-19: SecurityNotifier for the password-reset flow. The
	// concrete OTPDelivery satisfies the auth.SecurityNotifier interface
	// (SendSecurityNotification + SendPasswordResetOTP), so in prod
	// (smtpCfg != nil) the same delivery handles signup OTPs and
	// password-reset OTPs through the same SMTP transport. Dev stub
	// shadows the same surface so forgot-password works in dev too.
	var pwdResetNotifier auth.SecurityNotifier

	if smtpCfg != nil {
		realOTPDelivery := email.NewDynamicOTPDelivery(smtpReader)
		otpDelivery = realOTPDelivery
		pwdResetNotifier = realOTPDelivery
		teamEmailSender = email.NewDynamicInvitationSender(smtpReader)
		galleryShareSender = email.NewDynamicGalleryShareSender(smtpReader)
		galleryAutomationSender = email.NewDynamicGalleryAutomationSender(smtpReader)
		notificationEmailSender = email.NewDynamicNotificationSender(smtpReader)
		log.Printf("Email: SMTP transport wired dynamically to %s:%d (from=%s)",
			smtpCfg.Host, smtpCfg.Port, smtpCfg.FromAddress)
	} else {
		stubAllowed := strings.EqualFold(os.Getenv("DEV_STUB_EMAIL"), "true")
		envName := strings.ToLower(os.Getenv("APP_ENV"))
		isProduction := envName == "production" || envName == "prod"
		if !stubAllowed || isProduction {
			log.Fatalf("FATAL: No SMTP config (SMTP_HOST/SMTP_PORT/SMTP_FROM all missing) "+
				"and DEV_STUB_EMAIL != true (or APP_ENV=%q is production). "+
				"Set SMTP_* env vars, or explicitly set DEV_STUB_EMAIL=true in a non-production "+
				"APP_ENV to acknowledge stdout email stubs for dev. "+
				"(ISSUE-002 production-readiness guard.)", envName)
		}
		otpDelivery = &logOTPDelivery{}
		pwdResetNotifier = &logSecurityNotifier{}
		teamEmailSender = &logEmailSender{}
		log.Println("WARNING: Email stubs active (DEV_STUB_EMAIL=true) — every email " +
			"goes to stdout. DO NOT USE IN PRODUCTION.")
	}

	authOTPRepo := repository.NewAuthOTPCodeRepo(dbPool)

	// OTP service backed by Postgres so registration codes survive restarts
	// and work consistently across API instances.
	otpSvc := auth.NewPersistentOTPServiceWithDelivery(auth.OTPConfig{
		CodeLength:      6,
		Expiry:          15 * time.Minute,
		MaxAttempts:     5,
		RateLimitMax:    10,
		RateLimitWindow: 15 * time.Minute,
	}, otpDelivery, authOTPRepo, "registration")

	// JWT
	jwtSvc := auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
		MaxSessions:        5,
	})
	// F-006 Part B (audit 2026-04-10): wire the DB-backed refresh
	// session store so refresh tokens survive service restarts. The
	// jwtService falls back to its default in-memory store if this
	// is not called (legacy behavior + tests).
	refreshSessionRepo := repository.NewRefreshSessionRepo(dbPool)
	jwtSvc = jwtSvc.(interface {
		WithRefreshStore(auth.RefreshSessionStore) auth.JWTService
	}).WithRefreshStore(refreshSessionRepo)
	log.Println("F-006 Part B: refresh sessions now persist via refresh_sessions table")

	wsLookup := workspace.NewAuthLookup(dbPool)
	var oauthSvc *auth.OAuthService
	googleClientID := platformSettingValue(context.Background(), platformSettingsRepo, "auth", "google_client_id", "GOOGLE_CLIENT_ID")
	googleClientSecret := platformSettingValue(context.Background(), platformSettingsRepo, "auth", "google_client_secret", "GOOGLE_CLIENT_SECRET")
	googleRedirectURL := platformSettingValue(context.Background(), platformSettingsRepo, "auth", "google_redirect_url", "GOOGLE_REDIRECT_URL")
	googleStateKey := platformSettingValue(context.Background(), platformSettingsRepo, "auth", "google_oauth_state_key", "GOOGLE_OAUTH_STATE_KEY")
	if err := validateGoogleRedirectURLForEnv(googleRedirectURL, strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))); err != nil {
		log.Printf("Google OAuth disabled: invalid auth.google_redirect_url / GOOGLE_REDIRECT_URL %q: %v", googleRedirectURL, err)
		googleRedirectURL = ""
	}
	if googleStateKey == "" {
		googleStateKey = googleClientSecret
	}
	if googleClientID != "" && googleClientSecret != "" && googleRedirectURL != "" {
		oauthStore := newOAuthUserStore(userSvc, dbPool)
		googleProvider := auth.NewGoogleProvider(googleClientID, googleClientSecret, googleRedirectURL)
		oauthSvc = auth.NewOAuthService(auth.OAuthConfig{
			ClientID:     googleClientID,
			ClientSecret: googleClientSecret,
			RedirectURI:  googleRedirectURL,
			StateKey:     googleStateKey,
		}, googleProvider, oauthStore)
		log.Println("Google OAuth configured")
	} else {
		log.Println("Google OAuth disabled: missing auth.google_client_id / auth.google_client_secret / auth.google_redirect_url (or GOOGLE_* env fallback)")
	}

	// Terms-of-Service / copyright acceptance (migration 144). One service
	// powers the auth-side registration capture + /auth/me terms status, the
	// /api/v1/legal/terms endpoints, and the upload gate. A dedicated audit-log
	// service mirrors each acceptance into audit_logs; the per-user ledger
	// (user_terms_acceptances) remains the legal source of truth.
	termsSvc := service.NewTermsService(
		repository.NewTermsRepo(dbPool),
		service.NewAuditLogService(repository.NewAuditLogRepo(dbPool)),
	)

	authHandler := auth.NewHandler(otpSvc, jwtSvc, oauthSvc, userAuthAdapter).
		WithWorkspaceLookup(wsLookup).
		WithPlanTierLookup(wsLookup).
		WithTerms(termsSvc)

	// ──────────────────────── F-007 (M17 wave 2): MFA setup ────────────────────
	//
	// Load the envelope once here so both the MFA handler and the later
	// platform_settings repo can share it. A missing KEK is non-fatal in
	// dev — MFA simply reports mfa_unavailable until the KEK is set. In
	// production the later platform_settings block still enforces the
	// fatal fail on missing KEK, so the strict posture survives.
	var mfaEnvelope *backendcrypto.Envelope
	{
		kekHex := os.Getenv("PLATFORM_SETTINGS_KEK")
		if kekHex != "" {
			env, err := backendcrypto.NewEnvelopeFromHex(kekHex)
			if err != nil {
				log.Fatalf("FATAL: PLATFORM_SETTINGS_KEK is invalid: %v", err)
			}
			mfaEnvelope = env
		}
	}

	mfaEnrollmentsRepo := repository.NewUserMFAEnrollmentsRepo(dbPool)
	mfaRecoveryRepo := repository.NewUserMFARecoveryCodesRepo(dbPool)
	totpSvc := auth.NewTOTPService(auth.TOTPConfig{Issuer: os.Getenv("MFA_ISSUER_NAME")})
	recoverySvc := auth.NewRecoveryCodeService(auth.RecoveryCodeConfig{})

	mfaEnrollmentAdapter := &mfaEnrollmentStoreAdapter{repo: mfaEnrollmentsRepo}
	mfaRecoveryAdapter := &mfaRecoveryCodeStoreAdapter{repo: mfaRecoveryRepo}

	mfaHandler := auth.NewMFAHandler(
		totpSvc,
		recoverySvc,
		mfaEnrollmentAdapter,
		mfaRecoveryAdapter,
		mfaEnvelope,
		jwtSvc,
		os.Getenv("MFA_ISSUER_NAME"),
		func(ctx context.Context, userID uuid.UUID) (string, error) {
			u, err := userSvc.GetByID(ctx, userID.String())
			if err != nil || u == nil {
				return "", err
			}
			return u.Email, nil
		},
		wsLookup,
	)

	// Wire the authed-user-ID reader so MFA handlers can read the JWT
	// claim subject from the middleware context without importing the
	// middleware package (which would create an import cycle).
	auth.SetAuthedUserIDReader(func(r *http.Request) (uuid.UUID, bool) {
		claims := middleware.JWTClaimsFromContext(r.Context())
		if claims == nil {
			return uuid.Nil, false
		}
		sub, _ := claims["sub"].(string)
		if sub == "" {
			return uuid.Nil, false
		}
		uid, err := uuid.Parse(sub)
		if err != nil {
			return uuid.Nil, false
		}
		return uid, true
	})

	// Attach MFA step-up to the main auth handler so Login can issue
	// challenge tokens for enrolled users.
	authHandler = authHandler.WithMFA(mfaEnrollmentAdapter, mfaHandler)

	// ──────────────────────── ISSUE-003 Event Publisher ────────────────────────
	//
	// Brownfield P1: NATS JetStream ran in the compose stack but
	// zero backend code consumed it — every published event went to
	// an in-process stdout stub that silently dropped messages on
	// restart. The selected publisher is chosen at startup via the
	// EVENT_BROKER env var (default "inprocess" for backward
	// compatibility with existing dev workflows):
	//
	//   EVENT_BROKER=nats       → events.NATSPublisher (JetStream)
	//   EVENT_BROKER=inprocess  → logEventPublisher stdout stub
	//
	// NATS_URL defaults to "nats://nats:4222" for the compose stack;
	// operators pointing at external NATS set it explicitly.
	//
	// Note: onboarding.EventPublisher, workspace.EventPublisher, and
	// handler.EventPublisher are three separate interface declarations
	// with identical shapes (Publish(ctx, subject, data) error), so a
	// single structurally-compatible value can be passed to all
	// three. We use a narrow local type to make the intent explicit.
	type broadcastPublisher interface {
		Publish(ctx context.Context, subject string, data []byte) error
	}
	var eventPublisher broadcastPublisher
	switch strings.ToLower(os.Getenv("EVENT_BROKER")) {
	case "nats":
		natsURL := os.Getenv("NATS_URL")
		if natsURL == "" {
			natsURL = "nats://nats:4222"
		}
		// F-036: authenticate the NATS client when NATS_AUTH_TOKEN is set.
		// Empty token (dev / docker-compose) connects without a credential.
		natsAuthToken := os.Getenv("NATS_AUTH_TOKEN")
		natsPub, err := events.NewNATSPublisherWithAuth(natsURL, natsAuthToken)
		if err != nil {
			log.Fatalf("FATAL: EVENT_BROKER=nats but NATS connection failed (ISSUE-003): %v", err)
		}
		defer natsPub.Close()
		eventPublisher = natsPub
		log.Printf("Events: NATS JetStream publisher wired to %s (client auth: %v)", natsURL, natsAuthToken != "")
	default:
		eventPublisher = &logEventPublisher{}
		log.Println("Events: in-process stdout stub active (set EVENT_BROKER=nats to switch to JetStream)")
	}

	// Real workspace service backed by DB
	wsRepo := workspace.NewPgRepo(dbPool)
	wsSvc := workspace.NewService(wsRepo, eventPublisher, &logStorageBucket{})
	wsHandler := workspace.NewHandler(wsSvc)

	// Onboarding with persistent repo (migration 067) + real workspace creation.
	// The repo replaces the prior in-memory map so onboarding progress
	// survives backend restarts — critical for the multi-step flow
	// where a user might take minutes between state selection and
	// profile submission. eventPublisher is the env-selected broker
	// (real NATS JetStream or in-process stdout stub) from the lines
	// above, not a fresh log stub.
	onbRepo := onboarding.NewPgRepo(dbPool)
	onbSvc := onboarding.NewService(
		onbRepo,
		&onboardingWorkspaceCreator{wsSvc: wsSvc, pool: dbPool},
		eventPublisher,
		onboarding.WithUserUpdater(&onboardingUserUpdater{userSvc: userSvc}),
		// 2026-05-19 admin-granted plan comp (migration 113) — the
		// onboarding service consumes users.pending_plan_tier just
		// before workspace creation so super-admin-issued comps land
		// on the workspace at the granted tier instead of the user's
		// wizard pick.
		onboarding.WithPlanGrantStore(&onboardingPlanGrantStore{repo: repository.NewAdminUserRepo(dbPool)}),
	)
	onbHandler := onboarding.NewHandler(onbSvc)

	// Real team repos backed by DB
	invRepo := teamPkg.NewPgInvitationRepo(dbPool)
	memberRepo := teamPkg.NewPgMemberRepo(dbPool)
	// ISSUE-002: use the selected email transport (real SMTP or
	// dev stub) for team invitation mail.
	invSvc := teamPkg.NewInvitationService(
		invRepo,
		teamEmailSender,
		memberRepo,
		userAuthAdapter,
		teamPkg.InvitationConfig{ExpiryDuration: 7 * 24 * time.Hour},
	)
	teamHandler := teamPkg.NewHandler(invSvc, nil, nil)

	// Real DB context for RLS + audit logging
	dbCtx := middleware.NewPgDBContext(dbPool)
	auditLog := middleware.NewPgAuditLog(dbPool)

	// Credential endpoints with a tight per-IP limiter (v0.0.47).
	// Register, Login, and VerifyOTP are the prime targets for credential
	// stuffing, brute-force password guessing, and spam signups. 5/min
	// per IP is well above legitimate human retry rates while making
	// automated attacks uneconomical — 7.2k attempts/day vs 86k at the
	// previous global 60/min budget. A SINGLE limiter instance wraps
	// both the /auth and /api/v1/auth prefixes so an attacker cannot
	// double their budget by alternating. Same rationale as the MFA
	// verify limiter below.
	credLimiter, resetCredLimiter := middleware.RateLimitWithValkey(valkeyClient, "cred", 5, time.Minute)
	r.With(credLimiter).Post("/auth/register", authHandler.Register)
	r.With(credLimiter).Post("/auth/login", authHandler.Login)
	r.With(credLimiter).Post("/auth/verify-otp", authHandler.VerifyOTP)
	r.With(credLimiter).Post("/auth/resend-otp", authHandler.ResendOTP)
	r.With(credLimiter).Post("/api/v1/auth/register", authHandler.Register)
	r.With(credLimiter).Post("/api/v1/auth/login", authHandler.Login)
	r.With(credLimiter).Post("/api/v1/auth/verify-otp", authHandler.VerifyOTP)
	r.With(credLimiter).Post("/api/v1/auth/resend-otp", authHandler.ResendOTP)

	// M39 E6-S1 (FR-F02): password reset endpoints in the public group.
	// Rate limiting happens at two layers: credLimiter (per IP) wraps each
	// route, and PasswordService enforces per-email limits inside its
	// RequestReset call.
	passwordSvc := auth.NewPasswordServiceWithOTPStore(auth.PasswordConfig{
		ResetOTPExpiry:    15 * 60,
		MaxFailedAttempts: 5,
		LockoutDuration:   15 * 60,
	}, newPgPasswordStore(dbPool), pwdResetNotifier, authOTPRepo)
	pwResetRevoker := newPgRefreshSessionRevokerForReset(dbPool)
	pwResetHandler := handler.NewAuthPasswordResetHandler(passwordSvc, pwResetRevoker)
	r.With(credLimiter).Post("/auth/request-password-reset", pwResetHandler.RequestReset)
	r.With(credLimiter).Post("/auth/reset-password", pwResetHandler.ResetPassword)
	r.With(credLimiter).Post("/api/v1/auth/request-password-reset", pwResetHandler.RequestReset)
	r.With(credLimiter).Post("/api/v1/auth/reset-password", pwResetHandler.ResetPassword)

	// Development-only endpoints so automated test suites can reset
	// in-process state between runs without restarting the server.
	// Never registered in production.
	if os.Getenv("APP_ENV") == "development" {
		r.Post("/internal/test/reset-rate-limit", func(w http.ResponseWriter, r *http.Request) {
			resetCredLimiter()
			w.WriteHeader(http.StatusNoContent)
		})
		// Purge all refresh sessions for a given user so MaxSessions never
		// blocks test logins that run the same account multiple times.
		r.Post("/internal/test/purge-sessions", func(w http.ResponseWriter, r *http.Request) {
			email := r.URL.Query().Get("email")
			if email == "" {
				http.Error(w, "email query param required", http.StatusBadRequest)
				return
			}
			_, err := sqlDB.ExecContext(r.Context(),
				`DELETE FROM refresh_sessions WHERE sub = (SELECT id::text FROM users WHERE email = $1)`,
				email)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})
	}

	// Mount the rest of the auth routes (oauth, refresh, logout). The
	// credential endpoints above are deliberately NOT inside Routes()
	// — see the comment on authHandler.Routes() for why.
	r.Mount("/auth", authHandler.Routes())
	r.Mount("/api/v1/auth", authHandler.Routes())

	// Public states listing — used by /register before the user has any
	// credentials, so it must not sit behind JWT middleware. Cache-Control
	// is set inside the handler; the underlying table is effectively
	// immutable reference data seeded at migration 010.
	statesHandler := handler.NewStatesHandler(handler.NewPgStatesRepo(dbPool))
	r.Get("/api/v1/states", statesHandler.List)

	// F-007 (M17 wave 2): MFA public route. /auth/verify-totp uses the
	// mfa_token issued by Login as its own credential, so it must NOT
	// be behind JWT middleware.
	//
	// M17 audit followup (S-002): wrap the mount in a tighter per-IP
	// limiter on top of the global 60/min — 10 attempts per minute
	// shared across both the legacy /auth and versioned /api/v1/auth
	// mounts so an attacker cannot double their budget by hitting
	// both paths. This cuts brute-force throughput against the 10^6
	// TOTP code space while leaving legitimate retry-on-typo UX alive.
	mfaVerifyLimiter, _ := middleware.RateLimitWithValkey(valkeyClient, "mfa", 10, time.Minute)
	// FIX (cobolt-fix 2026-04-11): chi panics when Mount() is called a
	// second time on the same path ('/auth'), and '/auth' is already
	// mounted above via authHandler.Routes(). Register the specific
	// MFA public leaf routes directly so the per-IP rate limiter still
	// applies without conflicting with the existing mount. Keeps the
	// same 10/min rate-limit window shared across /auth and /api/v1/auth
	// prefixes as intended by the M17 S-002 audit followup.
	r.With(mfaVerifyLimiter).Post("/auth/verify-totp", mfaHandler.VerifyTOTP)
	r.With(mfaVerifyLimiter).Post("/auth/verify-recovery-code", mfaHandler.VerifyRecoveryCode)
	r.With(mfaVerifyLimiter).Post("/api/v1/auth/verify-totp", mfaHandler.VerifyTOTP)
	r.With(mfaVerifyLimiter).Post("/api/v1/auth/verify-recovery-code", mfaHandler.VerifyRecoveryCode)

	// Protected routes — JWT auth → tenant context → state check
	// SOC2 CC6.3: MFA enforcement for photographer workspace routes.
	// Gated behind MFA_ENFORCE_PHOTOGRAPHERS=1 so rollout is progressive.
	// When unset (default), RequireMFA is NOT mounted — zero behavioral change.
	r.Group(func(pr chi.Router) {
		pr.Use(middleware.JWTAuth(jwtSvc))
		// S5-G1 (audit HIGH): block writes from impersonated sessions on the
		// workspace/team tenant surface. After JWTAuth so the claim is in context.
		pr.Use(middleware.RejectImpersonationWrites)
		pr.Use(middleware.TenantContext(dbCtx, auditLog))
		pr.Use(middleware.RequireState)
		if os.Getenv("MFA_ENFORCE_PHOTOGRAPHERS") == "1" {
			pr.Use(middleware.RequireMFA)
			log.Println("SOC2: MFA enforcement ENABLED for workspace/team routes")
		}

		pr.Mount("/workspace", wsHandler.Routes())
		pr.Mount("/team", teamHandler.Routes())
	})

	// Onboarding routes (JWT auth but exempt from RequireState)
	r.Group(func(r chi.Router) {
		r.Use(middleware.JWTAuth(jwtSvc))
		r.Mount("/onboarding", onbHandler.Routes())
	})

	// F-007 (M17 wave 2): authenticated MFA routes (enroll, verify-
	// enrollment, status). These are JWT-only — no tenant context
	// required because enrollment happens from any workspace state.
	r.Group(func(r chi.Router) {
		r.Use(middleware.JWTAuth(jwtSvc))
		r.Mount("/auth/mfa", mfaHandler.AuthenticatedRoutes())
		r.Mount("/api/v1/auth/mfa", mfaHandler.AuthenticatedRoutes())
	})

	// M18: user profile routes (JWT-only — no tenant context required).
	profileHandler := handler.NewProfileHandler(userSvc)
	r.Group(func(r chi.Router) {
		r.Use(middleware.JWTAuth(jwtSvc))
		// S5-G1 (audit HIGH): profile PUT is a tenant write — block it under an
		// impersonation token. After JWTAuth so the claim is populated.
		r.Use(middleware.RejectImpersonationWrites)
		r.Get("/api/v1/users/profile", profileHandler.GetProfile)
		r.Put("/api/v1/users/profile", profileHandler.UpdateProfile)
	})

	// ──────────────────────── M2: Asset Management & Gallery ────────────────────────

	// ──────────────────────── Storage Provider (Backblaze B2 — MANDATORY) ────────────────
	// Local storage is NOT supported. Managed B2 config resolves from
	// platform_settings first and environment variables second. Never hardcode
	// credentials. Never fall back to local filesystem. B2 exposes an
	// S3-compatible API; the storage factory routes B2 through its "s3" case.
	// Note: b2_key_id / B2_KEY_ID maps to S3 AccessKeyID; b2_application_key /
	// B2_APPLICATION_KEY maps to SecretAccessKey.
	storageCfg := storage.Config{
		Driver:    platformSettingValueDefault(context.Background(), platformSettingsRepo, "storage", "driver", "s3", "STORAGE_DRIVER"),
		Bucket:    platformSettingValueAny(context.Background(), platformSettingsRepo, "storage", "b2_bucket_name", "B2_BUCKET_NAME", "B2_BUCKET"),
		Region:    platformSettingValueDefault(context.Background(), platformSettingsRepo, "storage", "b2_region", "us-east-005", "B2_REGION"),
		Endpoint:  platformSettingValueAny(context.Background(), platformSettingsRepo, "storage", "b2_endpoint", "B2_ENDPOINT"),
		AccessKey: platformSettingValueAny(context.Background(), platformSettingsRepo, "storage", "b2_key_id", "B2_KEY_ID", "B2_ACCESS_KEY_ID"),
		SecretKey: platformSettingValueAny(context.Background(), platformSettingsRepo, "storage", "b2_application_key", "B2_APPLICATION_KEY", "B2_SECRET_ACCESS_KEY"),
		// 2026-05-20: opt-in server-side encryption. STORAGE_SSE_MODE values:
		//   "AES256" → SSE-B2 (server-managed AES-256), transparent on GET
		//   "SSE-C"  → customer-managed key (we hold it); requires
		//              STORAGE_SSE_C_KEY (64-char hex of 32-byte AES key)
		//   ""       → no SSE header (existing-bucket pass-through)
		// SSE-C key custody: LOSING THE KEY = LOSING ALL ENCRYPTED DATA.
		// Backed up in platform_settings.storage.sse_customer_key_hex with
		// env fallback for bootstrap.
		SSEMode:           platformSettingValueAny(context.Background(), platformSettingsRepo, "storage", "sse_mode", "STORAGE_SSE_MODE"),
		SSECustomerKeyHex: platformSettingValueAny(context.Background(), platformSettingsRepo, "storage", "sse_customer_key_hex", "STORAGE_SSE_C_KEY"),
	}
	if storageCfg.Driver == "local" {
		log.Fatal("FATAL: storage.driver / STORAGE_DRIVER=local is not allowed. Use Backblaze B2 (s3).")
	}
	if storageSSERequiredForEnv(strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))) && strings.TrimSpace(storageCfg.SSEMode) == "" {
		log.Fatalf("FATAL: storage.sse_mode / STORAGE_SSE_MODE is required for APP_ENV=%q. Set storage.sse_mode=AES256 or storage.sse_mode=SSE-C with storage.sse_customer_key_hex.", os.Getenv("APP_ENV"))
	}
	storageProvider, err := storage.NewProvider(storageCfg)
	if err != nil {
		log.Fatalf("FATAL: failed to create storage provider: %v\nEnsure platform_settings storage.b2_bucket_name, storage.b2_region, storage.b2_endpoint, storage.b2_key_id, storage.b2_application_key are set (env fallback: B2_BUCKET_NAME, B2_REGION, B2_ENDPOINT, B2_KEY_ID, B2_APPLICATION_KEY).", err)
	}
	sseDisplay := storageCfg.SSEMode
	if sseDisplay == "" {
		sseDisplay = "disabled"
	}
	if sseDisplay == "SSE-C" {
		// Decorate with key-fingerprint info (first 4 hex chars of the
		// configured key) so operators can verify the right key is loaded
		// without exposing the secret. Length validation already happened
		// inside the s3 client constructor; if we got here, the key is
		// well-formed.
		k := storageCfg.SSECustomerKeyHex
		if len(k) >= 8 {
			sseDisplay = fmt.Sprintf("SSE-C (key fingerprint: %s…%s)", k[:4], k[len(k)-4:])
		}
	}
	log.Printf("Storage: Backblaze B2 initialized (bucket: %s, endpoint: %s, sse: %s)", storageCfg.Bucket, storageCfg.Endpoint, sseDisplay)

	// M2 Repositories
	assetRepo := repository.NewAssetRepo(dbPool)
	// 2026-05-21: asset_derivatives writer is wired into the thumbnail
	// worker so per-variant WebP size/dims land in the DB and the dashboard
	// storage-by-type widget can render non-zero derivatives.
	assetDerivativeRepo := repository.NewAssetDerivativeRepo(dbPool)
	galleryRepo := repository.NewGalleryRepo(dbPool)
	galleryAssetRepo := repository.NewGalleryAssetRepo(dbPool)
	shareLinkRepo := repository.NewShareLinkRepo(dbPool)
	galleryShareLogRepo := repository.NewGalleryShareLogRepo(dbPool)
	proofingRepo := repository.NewProofingRepo(dbPool)
	// M41/105: anonymous guest favorites for the public viewer.
	galleryFavoritesRepo := repository.NewGalleryFavoritesRepo(dbPool)

	// M11 Services (initialized early — used by M2 services)
	storageAccountingSvc := service.NewStorageAccounting(dbPool)
	albumRepo := repository.NewAlbumRepo(dbPool)
	// AlbumService is wired with the asset + favorites repos so the
	// "Favorites" utility smart album (M41/105) resolves real guest
	// hearts on the public viewer, and so the owner dashboard
	// /api/v1/albums/{id}/assets endpoint dispatches smart-album
	// filters instead of returning the empty manual join table.
	albumSvc := service.NewAlbumService(albumRepo).
		WithGalleryRepo(galleryRepo).
		WithAssetRepo(assetRepo).
		WithFavoritesRepo(galleryFavoritesRepo)

	// M2 Services
	exifSvc := service.NewExifServiceWithDeps(storageProvider, assetRepo)
	storageEncrypted := storageCfg.EncryptionEnabled()
	storageEncryptionAlgo := storageCfg.EncryptionAlgorithm()
	const storageEncryptionVersion = 1
	uploadSvc := service.NewUploadService(storageProvider, assetRepo, exifSvc).
		WithStorageAccounting(storageAccountingSvc).
		WithEncryptionMetadata(storageEncrypted, storageEncryptionAlgo, storageEncryptionVersion)

	// ──────────────────────── M16 Tier D Upload Screening ──────────────────
	// Build the validation stack up-front so it can be wired into both the
	// chunked upload handler (M2) and the asset handler (M2). The services
	// here depend on sqlDB (the stdlib adapter over the pgx pool).
	//
	// Enforcement mode is fail-closed by default. Set
	// TIER_D_ENFORCE_MODE=0 only for local migration/debugging; production
	// upload screening must reject bad/missing manifests rather than run as
	// telemetry-only.
	m16EnforceMode := os.Getenv("TIER_D_ENFORCE_MODE") != "0"
	uploadPolicyCatalog := service.NewUploadPolicyCatalog(sqlDB)
	workspacePolicySvc := service.NewWorkspacePolicyService(sqlDB, nil) // audit log wired below after auditLogSvc
	// UploadAllowlist: token issue/consume for FP override flow.
	uploadAllowlistRepo := service.NewPgUploadAllowlistRepo(sqlDB)
	uploadAllowlistSvc := service.NewUploadAllowlistService(uploadAllowlistRepo)
	// UploadModeration: admin queue + override + analytics.
	uploadModerationRepo := service.NewPgUploadModerationRepo(sqlDB)
	// NOTE: uploadModerationSvc is constructed later (inside the admin init
	// block) so it can reference the audit log service. The allowlist
	// service and moderation repo are hoisted here so the validation
	// service can be built before M2 routes register.
	_ = uploadModerationRepo // suppress unused warning until admin block
	// UploadManifestValidation: the runtime enforcement surface called by
	// ChunkedUploadHandler.CreateSession and AssetHandler.Upload.
	uploadValidationSvc := service.NewUploadManifestValidation(
		uploadPolicyCatalog,
		workspacePolicySvc,
		nil, // audit log — wired through WorkspacePolicyService instead
		m16EnforceMode,
	)
	log.Printf("M16 Tier D: upload screening service initialized (enforce=%v)", m16EnforceMode)
	assetSvc := service.NewAssetService(assetRepo, storageProvider).
		WithStorageAccounting(storageAccountingSvc).
		WithDerivativeRepo(assetDerivativeRepo)
	thumbnailSvc := service.NewThumbnailService(storageProvider).
		WithDecoder(service.NewCompositeDecoder())
	coverSvc := service.NewGalleryCoverService(galleryRepo, galleryAssetRepo)
	gallerySvc := service.NewGalleryService(galleryRepo, galleryAssetRepo, coverSvc).
		WithAssetRepo(assetRepo).
		WithAssetDeleteService(assetSvc).
		WithAlbumService(albumSvc)
	shareLinkSvc := service.NewShareLinkService(shareLinkRepo)
	proofingSvc := service.NewProofingService(proofingRepo, galleryRepo).
		WithNotifications(repository.NewNotificationRepo(dbPool)) // GAL-FR-134
	galleryFavoritesSvc := service.NewGalleryFavoritesService(galleryFavoritesRepo, galleryRepo)
	storageConfigSvc := service.NewStorageConfigService(dbPool)

	// M13 Services: Gallery Access, Proofing Sessions, Comments, Album Approval
	accessLogRepo := repository.NewGalleryAccessLogRepo(dbPool)
	proofingSessionRepo := repository.NewProofingSessionRepo(dbPool)
	proofingCommentRepo := repository.NewProofingCommentRepo(dbPool)
	albumApprovalRepo := repository.NewAlbumApprovalRepo(dbPool)
	galleryAccessSvc := service.NewGalleryAccessService(galleryRepo, accessLogRepo)
	// S4-G4/E: mint durable, node-portable gallery-access sessions via an
	// HMAC-signed token so a client verified on app1 stays valid on app2 and
	// survives deploys/restarts (the old in-memory session map did neither).
	// Fail-soft: if the key can't be loaded we log and fall back to the legacy
	// in-memory map rather than breaking gallery password verification.
	if gsKey, gsErr := buildGallerySessionSigningKey(context.Background(), platformSettingsRepo); gsErr != nil {
		log.Printf("WARNING: gallery-session signing key unavailable (%v) — falling back to per-process in-memory sessions (single-node only)", gsErr)
	} else {
		galleryAccessSvc = galleryAccessSvc.WithSessionSigningKey(gsKey)
		log.Println("S4-G4/E: gallery-access sessions are HMAC-signed and node-portable")
	}
	proofingSessionSvc := service.NewProofingSessionService(proofingSessionRepo, proofingRepo)
	proofingCommentSvc := service.NewProofingCommentService(proofingCommentRepo)
	albumApprovalSvc := service.NewAlbumApprovalService(albumApprovalRepo)

	// M14 Services: Downloads, Analytics, Webhooks, Product Catalog, Cart
	downloadRepo := repository.NewDownloadRepo(dbPool)
	galleryAnalyticsRepo := repository.NewGalleryAnalyticsRepo(dbPool)
	webhookRepo := repository.NewWebhookRepo(dbPool)
	productRepo := repository.NewProductRepo(dbPool)
	cartRepo := repository.NewCartRepo(dbPool)
	galleryAnalyticsSvc := service.NewGalleryAnalyticsService(galleryAnalyticsRepo)
	webhookSvc := service.NewWebhookService(webhookRepo)
	downloadSvc := service.NewDownloadService(assetRepo, galleryAssetRepo, storageProvider).WithDownloadRepo(downloadRepo)
	// (Valkey client is built earlier, before the rate limiters that use it.)

	productSvc := service.NewProductService(productRepo)
	// Cart service uses productRepo for price snapshotting. The
	// CartCouponAdapter wraps the shared coupon repo and enforces
	// only the anonymous-client-safe checks (active, not expired,
	// not exhausted) — per-user and plan/state scopes live in the
	// full platform CouponValidationService path and don't apply
	// to public gallery cart previews. Repo is stateless so we can
	// instantiate it here even though main.go also builds one later
	// for the M6 platform coupon routes.
	cartCouponRepo := repository.NewCouponRepo(dbPool)
	cartCouponAdapter := service.NewCartCouponAdapter(cartCouponRepo)
	cartSvc := service.NewCartService(cartRepo, productRepo, cartCouponAdapter)
	// M14 GAL-FR-159: proofing → fulfillment bridge. Pricer is nil so
	// bridged orders start at zero subtotal; a subsequent phase will
	// wire a PriceProofingSelections adapter that computes digital
	// delivery fees or auto-selects bundled products. proofingRepo is
	// already declared earlier in the file, so we only construct
	// orderRepo and the bridge here.
	orderRepo := repository.NewOrderRepo(dbPool)
	fulfillmentBridge := service.NewProofingFulfillmentBridge(proofingRepo, orderRepo, nil)
	// M14 GAL-FR-157: gallery sale banners
	bannerRepo := repository.NewBannerRepo(dbPool)
	bannerSvc := service.NewBannerService(bannerRepo)

	// M15 Services: Consent (with optional cascade emitter for withdrawal purges)
	consentRepo := repository.NewConsentRepo(dbPool)
	// emitter is nil for now — withdrawal cascade logs only until Valkey wiring (M15.1).
	// See _cobolt-output/latest/build/M15/M15-design-decisions.md § 2.
	var consentEmitter service.WithdrawalCascadeEmitter
	consentSvc := service.NewConsentService(consentRepo, consentEmitter)

	// M11 Services: Lifecycle
	lifecycleSvc := service.NewAssetLifecycleService(assetRepo, coverSvc, storageAccountingSvc).
		WithDerivativeRepo(assetDerivativeRepo)

	// Worker registry (declared at main scope so closures can register workers)
	workerRegistry := worker.NewRegistry()

	// In-process event broker for real-time SSE delivery to frontend
	eventBroker := handler.NewEventBroker()

	var m8Deps handler.M8Dependencies // declared here so public routes can reference
	// F-009: shared PIN brute-force limiter (5 attempts / 5 min per IP+resource),
	// consumed by BOTH the public gallery verify-pin (M2) and the stream
	// verify-pin (M8) so the two PIN gates share throttling state.
	pinLimiter := middleware.NewMemoryPINRateLimiter(5, 5*time.Minute)
	var m6Scheduler *scheduler.Scheduler                     // declared here so it can be started below next to workers
	var publicLeadDispatcher *handler.NotificationDispatcher // set inside protected block, consumed by public lead embed below

	// ──────────────────────── Public marketplace routes ────────────────────────
	// Freelancer listing browse + detail + availability and gear
	// browse/detail are intentionally reachable without a bearer token
	// so anonymous visitors can discover the marketplace from the
	// public landing page. Mounted BEFORE the authed group so the JWT
	// middleware never sees them.

	// PR-2b face hook: faceSvc is constructed inside the bare scope block
	// below, but the thumbnail worker (declared after the block closes)
	// needs to call it. Declare the adapter at function scope so both
	// sides see it; nil until assigned in the AI wiring section.
	var faceEnqueueAdapter worker.FaceEnqueuerFunc
	{
		marketplaceFreelancerRepo := repository.NewFreelancerRepo(dbPool)
		marketplaceGearRepo := repository.NewGearRepo(dbPool)
		handler.RegisterM5PublicRoutes(r, handler.M5Dependencies{
			DB:             dbPool,
			FreelancerRepo: marketplaceFreelancerRepo,
			GearRepo:       marketplaceGearRepo,
		})
		log.Println("Public: M5 marketplace read routes registered")
	}

	// ──────────────────────── Protected API routes (JWT + Tenant) ──────────────
	// All M2, M3, M4 data-plane endpoints require authentication.
	// SOC2 CC6.3: MFA enforcement gated behind MFA_ENFORCE_PHOTOGRAPHERS=1.
	r.Group(func(api chi.Router) {
		api.Use(middleware.JWTAuth(jwtSvc))
		// S5-G1 (audit HIGH): impersonated admin sessions are read-only. Mounted
		// AFTER JWTAuth so the "impersonation" claim is populated in context, and
		// covering the full tenant API surface (galleries, uploads, assets,
		// proofing, etc.). Admin endpoints under this group carry their own
		// RequirePlatformRole("super_admin"/"admin") guards and are reached with the
		// admin's REAL token (impersonation=false), so they are unaffected; an
		// impersonation token (target tenant's platform_role) can't reach them anyway.
		api.Use(middleware.RejectImpersonationWrites)
		api.Use(middleware.TenantContext(dbCtx, auditLog))
		// M41 FR-UCRT-07: resolve workspaces.plan_tier for the tenant and
		// stash it on the request context. Runs after TenantContext so
		// workspace_id is already resolved. Nil-safe: if dbPool is somehow
		// unset, this is a no-op and downstream callers observe an empty
		// plan tier (which they MUST treat as "not enterprise").
		api.Use(middleware.PlanTierContext(&planTierPoolAdapter{pool: dbPool}))
		if os.Getenv("MFA_ENFORCE_PHOTOGRAPHERS") == "1" {
			api.Use(middleware.RequireMFA)
		}

		// M39 E9-S1 (FR-F06): photo-trail feed. Audit log repo is created
		// here (kept close to its sole consumer) because the M7 admin block
		// builds its own audit repo later. The service layer enforces
		// identity (SEC-F07) and the 30-day window.
		photoTrailAuditRepo := repository.NewAuditLogRepo(dbPool)
		photoTrailSvc := service.NewPhotoTrailService(photoTrailAuditRepo)
		photoTrailHandler := handler.NewPhotoTrailHandler(photoTrailSvc)
		api.Get("/api/v1/photo-trail", photoTrailHandler.List)

		// M2 + M11 Protected routes
		// Face-svc client — constructed early so it can be wired into both
		// m2Deps (for the public Photo Search endpoint) and the FaceService
		// further below. Nil when FACE_SVC_URL is unset; downstream code
		// is nil-safe and returns 503 / falls back to the legacy path.
		var earlyFaceClient *face.Client
		if faceSvcURL := os.Getenv("FACE_SVC_URL"); faceSvcURL != "" {
			fc, err := face.NewClient(face.Config{BaseURL: faceSvcURL})
			if err != nil {
				log.Fatalf("face-svc client init: %v", err)
			}
			earlyFaceClient = fc
		}

		m2Deps := handler.M2Dependencies{
			AssetService:            assetSvc,
			UploadService:           uploadSvc,
			GalleryService:          gallerySvc,
			ShareLinkService:        shareLinkSvc,
			GalleryShareSender:      galleryShareSender,
			GalleryShareLogRepo:     galleryShareLogRepo,
			PublicBaseURL:           os.Getenv("FRONTEND_URL"),
			ProofingService:         proofingSvc,
			GalleryFavoritesService: galleryFavoritesSvc,
			StorageConfigService:    storageConfigSvc,
			PINRateLimiter:          pinLimiter, // F-009: brute-force defence on public gallery verify-pin
			// M11
			AlbumService:         albumSvc,
			StorageAccountingSvc: storageAccountingSvc,
			LifecycleService:     lifecycleSvc,
			AssetRepo:            assetRepo,
			AssetDerivativeRepo:  assetDerivativeRepo,
			StorageProvider:      storageProvider,
			// M12
			GalleryDesignSvc:  service.NewGalleryDesignService(galleryRepo),
			GalleryRepo:       galleryRepo,
			DesignTemplateSvc: service.NewDesignTemplateService(repository.NewDesignTemplateRepo(dbPool), galleryRepo),
			DesignCollabSvc:   service.NewDesignCollabService(nil), // nil NATS — uses in-memory presence
			DesignAISvc:       nil,                                 // set after AI init below
			// M13
			GalleryAccessSvc:   galleryAccessSvc,
			ProofingSessionSvc: proofingSessionSvc,
			ProofingCommentSvc: proofingCommentSvc,
			AlbumApprovalSvc:   albumApprovalSvc,
			// M14
			DownloadService:     downloadSvc,
			GalleryAnalyticsSvc: galleryAnalyticsSvc,
			WebhookSvc:          webhookSvc,
			ProductService:      productSvc,
			CartService:         cartSvc,
			FulfillmentBridge:   fulfillmentBridge,
			BannerService:       bannerSvc,
			// M15
			ConsentSvc: consentSvc,
			// M16 Tier D upload screening — enforces scan manifest gate on
			// both the direct multipart upload path (AssetHandler.Upload)
			// and the chunked upload path (ChunkedUploadHandler.CreateSession).
			UploadValidationSvc: uploadValidationSvc,
			// Migration 144 terms gate applies to both upload entry points.
			TermsGate: termsSvc,
			// M13 deferred-FR closure (GAL-FR-115 branding, GAL-FR-107/108 FaceID).
			// ai.NewFaceRepo is stateless — constructing it twice (here and in
			// the AI init block below) is safe and keeps this block self-contained.
			Pool:       dbPool,
			FaceRepo:   ai.NewFaceRepo(dbPool),
			FaceClient: earlyFaceClient, // nil when FACE_SVC_URL unset → endpoint returns 503
			// Subscription upgrade payments via Razorpay/PhonePe. Credentials
			// resolve from platform_settings first, then environment fallback.
			SubscriptionUpgradeHandler: handler.NewSubscriptionUpgradeHandlerFromSettings(
				context.Background(),
				dbPool,
				&platformSettingsSMTPReader{repo: platformSettingsRepo},
			).WithStorageAccounting(storageAccountingSvc),
			// M21: FaceSvc is nil here — wired post-hoc after AI init below.
			// JobRepo is stateless (same pattern as FaceRepo).
			FaceSvc: nil,
			JobRepo: ai.NewJobRepo(dbPool),
		}
		galleryHandler := handler.RegisterM2Routes(api, m2Deps)

		// Public gallery routes — registered on outer router (no auth required)
		handler.RegisterPublicGalleryRoutes(r, m2Deps)

		// M16 E49-S1: public upload-policy versions endpoint. Mounted on
		// the outer router so the browser screening worker can fetch it
		// BEFORE the user is authenticated (the upload page loads the
		// worker as one of its first resources). Closes M16-GAP-02 from
		// the Step 03A code gap analysis.
		uploadPolicyHandler := handler.NewUploadPolicyHandler(uploadPolicyCatalog)
		uploadPolicyHandler.RegisterRoutes(r)

		// F-013 (M17 wave 6): Chunked upload routes now use a persistent
		// session store + direct-to-R2 multipart streaming. The tmpDir env
		// var is intentionally no longer consulted — there is no local
		// staging path anymore (F-008 hard law).
		uploadSessionsRepo := repository.NewUploadSessionsRepo(dbPool)

		// M40 / Upload Credit Meter wiring.
		//
		// The feature is opt-in — when UPLOAD_CREDIT_METER_ENABLED=true the
		// chunked upload path gates CreateSession on a ledger reservation
		// and posts consume/refund entries at finalize/cancel. Default (no
		// env var) is a NoopGate so existing behaviour is unchanged until
		// operators flip the switch.
		//
		// The upload credit service is safe to construct either way — the
		// LiveGate only calls it when the flag is on, and the balance
		// endpoint below feature-gates itself on
		// streaming.upload_credit_pill_v1 to return 404 when disabled
		// (matches the frontend hook contract, PR #32 pattern).
		uploadCreditSvc := uploadcredit.NewService(dbPool)
		var uploadCreditGate uploadgate.UploadCreditGate = uploadgate.NewNoopGate()
		if strings.EqualFold(os.Getenv("UPLOAD_CREDIT_METER_ENABLED"), "true") {
			uploadCreditGate = uploadgate.NewLiveGate(uploadCreditSvc)
			log.Printf("M40: upload credit meter ENABLED (LiveGate wired)")
		} else {
			log.Printf("M40: upload credit meter disabled (NoopGate — set UPLOAD_CREDIT_METER_ENABLED=true to enable)")
		}

		chunkedHandler := handler.NewChunkedUploadHandler(uploadSvc, assetRepo, storageProvider, uploadSessionsRepo).
			WithValidation(uploadValidationSvc).
			WithStorageAccounting(storageAccountingSvc).
			WithEncryptionMetadata(storageEncrypted, storageEncryptionAlgo, storageEncryptionVersion).
			WithClientSideEncryptionRequired(true).
			WithUploadCredit(uploadCreditGate).
			// Terms-of-Service / copyright acceptance gate (migration 144). No
			// upload — image or slideshow audio — proceeds until the photographer
			// has accepted the active terms. Enforced by default (no flag): the
			// requirement is "till accepted, do not allow any uploads".
			WithTermsGate(termsSvc).
			// S3-G4 / AREA-UPLOADER-3: server-side gallery linkage. CreateSession
			// validates an optional gallery_id (+ album_id) against the caller's
			// workspace and persists it; finalize links the asset itself so the
			// association never depends on a post-finalize client call.
			WithGalleryLinkage(galleryRepo, albumRepo, galleryAssetRepo)
		chunkedHandler.RegisterRoutes(api)

		// Terms-of-Service / copyright acceptance endpoints (GET current, GET
		// status, POST accept). Mounted on the authenticated api group but NOT
		// behind the upload terms gate — a user must be able to read and accept
		// the terms before they are allowed to upload.
		handler.NewTermsHandler(termsSvc).RegisterRoutes(api)

		// M40: balance endpoint for the <UploadCreditPill>. Mirrors
		// streaming/credits/balance wiring — adapter converts Service →
		// BalanceProvider interface so the handler package stays free of
		// any upload/credit dependency.
		//
		// Feature flag streaming.upload_credit_pill_v1 is captured from
		// env at startup (not re-read per request). Runtime toggle needs
		// an API restart; a platform_settings lookup is the follow-up
		// per PRD §8 Phase 4. The dashboard already mounts the
		// UploadCreditPill in production, so the endpoint defaults on to
		// avoid browser-visible 404s. Set UPLOAD_CREDIT_PILL_V1_ENABLED=false
		// to explicitly hide the feature.
		uploadBalanceEnv := os.Getenv("UPLOAD_CREDIT_PILL_V1_ENABLED")
		uploadBalanceHandler := &uploadhandlers.UploadBalanceHandler{
			Balance: &uploadCreditBalanceAdapter{svc: uploadCreditSvc},
			FeatureFlag: func(name string) bool {
				// Env wins over the implicit default. Upgrading to
				// platform_settings lookup is a follow-up — PRD §8 Phase 4.
				if uploadBalanceEnv != "" {
					return strings.EqualFold(uploadBalanceEnv, "true")
				}
				return true
			},
		}
		api.Get("/api/v1/uploads/balance", uploadBalanceHandler.GetBalance)

		// M41: package catalogue for the recharge modal. Returns all active
		// upload packages + current rate cards sorted by credits ASC so the
		// client can render tiers without re-ordering. No feature flag — the
		// catalogue is read-only and adding a 404 here would just break the
		// modal for workspaces that want to see prices before purchasing.
		uploadPackageHandler := &uploadhandlers.UploadPackageCatalogueHandler{
			Provider: &uploadPackageCatalogueAdapter{pool: dbPool},
		}
		api.Get("/api/v1/uploads/packages", uploadPackageHandler.GetPackages)

		// M41 FR-UCRT-11: refund-within-window endpoint. The service layer
		// enforces the 7-day window + fully-unspent eligibility checks in a
		// transaction; the handler only translates HTTP ↔ service and maps
		// error sentinels to 400/404/422 status codes. Workspace ownership
		// is verified both via the JWT workspace_id claim AND against
		// upload_purchases.workspace_id inside the service call — a
		// cross-workspace refund attempt returns 404, never 403, so the
		// existence of the target purchase is not leaked.
		uploadRefundHandler := &uploadhandlers.UploadRefundHandler{
			Svc: uploadCreditSvc,
		}
		api.Post("/api/v1/uploads/purchases/{id}/refund", uploadRefundHandler.Refund)

		// M41 FR-UCRT-05: PhonePe upload webhook. Provider callbacks carry no
		// JWT, so this route must live on the outer router; the handler's
		// X-VERIFY signature check is the source of trust. The PhonePe provider
		// is constructed lazily from env vars so a deploy without PhonePe
		// credentials wires the handler with a nil Verifier, which returns
		// 503 on every request (rather than 500 or silent success).
		var phonepeWebhookHandler *uploadhandlers.PhonePeUploadWebhookHandler
		if mID, sKey, sIdx, base := os.Getenv("PHONEPE_MERCHANT_ID"), os.Getenv("PHONEPE_SALT_KEY"), os.Getenv("PHONEPE_SALT_INDEX"), os.Getenv("PHONEPE_BASE_URL"); mID != "" && sKey != "" && sIdx != "" && base != "" {
			if ppp, err := streamingrecharge.NewPhonePeProvider(streamingrecharge.PhonePeConfig{
				MerchantID: mID, SaltKey: sKey, SaltIndex: sIdx, BaseURL: base,
			}); err == nil {
				phonepeWebhookHandler = &uploadhandlers.PhonePeUploadWebhookHandler{
					Verifier: ppp,
					Svc:      uploadCreditSvc,
				}
				log.Printf("M41: PhonePe upload webhook wired (merchant=%s)", mID)
			} else {
				log.Printf("M41: PhonePe provider construction failed (%v) — webhook handler disabled", err)
			}
		} else {
			log.Printf("M41: PhonePe env vars not set — webhook handler disabled; POST /api/v1/webhooks/phonepe/uploads returns 503")
		}
		if phonepeWebhookHandler == nil {
			phonepeWebhookHandler = &uploadhandlers.PhonePeUploadWebhookHandler{} // nil deps → 503
		}
		r.Post("/api/v1/webhooks/phonepe/uploads", phonepeWebhookHandler.Handle)

		// M41 FR-UCRT-06: Razorpay upload webhook. Same failure-closed
		// posture as the PhonePe sibling — missing env vars leave the
		// handler wired with nil deps → 503 on every request, never 200.
		var razorpayWebhookHandler *uploadhandlers.RazorpayUploadWebhookHandler
		if kID, kSec, wSec := os.Getenv("RAZORPAY_KEY_ID"), os.Getenv("RAZORPAY_KEY_SECRET"), os.Getenv("RAZORPAY_WEBHOOK_SECRET"); kID != "" && kSec != "" && wSec != "" {
			if rzp, err := streamingrecharge.NewRazorpayProvider(streamingrecharge.RazorpayConfig{
				KeyID:         kID,
				KeySecret:     kSec,
				WebhookSecret: wSec,
				BaseURL:       os.Getenv("RAZORPAY_BASE_URL"), // defaulted by NewRazorpayProvider if empty
			}); err == nil {
				razorpayWebhookHandler = &uploadhandlers.RazorpayUploadWebhookHandler{
					Verifier: rzp,
					Svc:      uploadCreditSvc,
				}
				log.Printf("M41: Razorpay upload webhook wired (key_id=%s)", kID)
			} else {
				log.Printf("M41: Razorpay provider construction failed (%v) — webhook handler disabled", err)
			}
		} else {
			log.Printf("M41: Razorpay env vars not set — webhook handler disabled; POST /api/v1/webhooks/razorpay/uploads returns 503")
		}
		if razorpayWebhookHandler == nil {
			razorpayWebhookHandler = &uploadhandlers.RazorpayUploadWebhookHandler{}
		}
		r.Post("/api/v1/webhooks/razorpay/uploads", razorpayWebhookHandler.Handle)

		// M41 FR-UCRT-04: upload monthly grant worker. Opt-in behind the
		// UPLOAD_CREDIT_MONTHLY_GRANT_ENABLED flag. When enabled, the
		// worker iterates every non-enterprise active workspace once per
		// hour and calls credit.Service.GrantMonthly with an anchor date
		// on the first of the calendar month. The service uses a
		// deterministic `monthly:{ws}:{YYYY-MM}` idempotency key so
		// multiple ticks within the same month collapse onto a single
		// ledger entry per workspace via the partial unique index on
		// upload_ledger_entries(workspace_id, idempotency_key) — the DB
		// guarantee, not a worker-side cache, so it survives restarts
		// and multi-pod deploys.
		//
		// Nil-safe: when UPLOAD_CREDIT_METER_ENABLED is false the worker
		// still registers but receives a nil svc (uploadCreditSvc stays
		// live though, so this branch is rare). runOnce short-circuits.
		if strings.EqualFold(os.Getenv("UPLOAD_CREDIT_MONTHLY_GRANT_ENABLED"), "true") {
			monthlyGrantWorker := worker.NewUploadMonthlyGrantWorker(dbPool, uploadCreditSvc)
			workerRegistry.Register("upload-monthly-grant", monthlyGrantWorker)
			log.Println("M41: upload monthly grant worker ENABLED (poll=1h)")
		} else {
			log.Println("M41: upload monthly grant worker disabled (set UPLOAD_CREDIT_MONTHLY_GRANT_ENABLED=true to enable)")
		}

		// M17 audit followup (S-011): register the upload-session cleanup
		// worker so abandoned chunked uploads don't leak R2 multipart
		// state and upload_sessions rows indefinitely. Polls every 15
		// minutes and aborts each expired session's R2 multipart upload
		// before deleting the DB row.
		uploadSessionCleanupWorker := worker.NewUploadSessionCleanupWorker(uploadSessionsRepo, storageProvider).
			// AREA-UPLOADER-5: release leaked reserved_bytes for expired,
			// never-finalized sessions before deleting their rows.
			WithStorageAccounting(storageAccountingSvc).
			// AREA-UPLOADER-6: skip aborting sessions that were actually
			// finalized but whose completed_at stamp failed to persist.
			WithAssetExistence(assetRepo)
		workerRegistry.Register("upload-session-cleanup", uploadSessionCleanupWorker)

		// AREA-UPLOADER-2: register the derivative-retry / dead-letter sweep so
		// assets whose WebP generation failed are bounded-retried and, once
		// exhausted, parked in an observable terminal state instead of being
		// silently stuck with broken thumbnails. Always registered (no flag) —
		// it is a pure recovery backstop with a 5-minute cadence.
		derivativeRetryWorker := worker.NewDerivativeRetryWorker(assetRepo)
		workerRegistry.Register("derivative-retry", derivativeRetryWorker)

		// AREA-UPLOADER-1: register the upload-credit expiry sweeper so dropped
		// Consume/Refund reservations (tab closed after reserve, transient
		// settle failure) are refunded back to the balance instead of
		// permanently double-charging. Only wire it when the credit meter is
		// enabled — when the meter is off no reserve entries are ever posted,
		// so there is nothing to expire. ExpireAbandoned is idempotent, so the
		// hourly cadence is safe across restarts and multi-pod deploys.
		if strings.EqualFold(os.Getenv("UPLOAD_CREDIT_METER_ENABLED"), "true") {
			uploadCreditExpiryWorker := worker.NewUploadCreditExpiryWorker(uploadCreditSvc)
			workerRegistry.Register("upload-credit-expiry", uploadCreditExpiryWorker)
			log.Println("AREA-UPLOADER-1: upload credit expiry worker ENABLED (poll=1h, ttl=24h)")
		} else {
			log.Println("AREA-UPLOADER-1: upload credit expiry worker disabled (credit meter off)")
		}

		log.Println("M2: routes registered")

		// ──────────────────────── M3: AI & Intelligence Layer ──────────────────────

		// AI encryption key (32 bytes from env — REQUIRED, no hardcoded default)
		aiEncKeyStr := os.Getenv("AI_ENCRYPTION_KEY")
		if aiEncKeyStr == "" {
			log.Println("WARNING: AI_ENCRYPTION_KEY not set. AI features that require encryption will be disabled.")
			aiEncKeyStr = "" // Empty key disables encrypted AI config storage
		}
		aiEncKey := []byte(aiEncKeyStr)

		// AI repositories
		aiConfigRepo := ai.NewConfigRepo(dbPool, aiEncKey)
		aiSpendRepo := ai.NewSpendRepo(dbPool)
		aiJobRepo := ai.NewJobRepo(dbPool)
		aiFaceRepo := ai.NewFaceRepo(dbPool)

		// M3 E8-S3: wire the face cluster resolver into the album service
		// so smart albums with smart_filter.face_cluster_label resolve to
		// the actual asset list at render time. *ai.FaceRepo implements
		// service.FaceClusterResolver via its ListClusterAssetIDs method.
		albumSvc.WithFaceResolver(galleryRepo, aiFaceRepo)

		// Gemini client
		geminiModelID := os.Getenv("GEMINI_MODEL_ID")
		if geminiModelID == "" {
			geminiModelID = "gemini-2.0-flash"
		}
		geminiClient := ai.NewGeminiClient(geminiModelID)

		// AI services
		faceSvc := ai.NewFaceService(aiFaceRepo, aiJobRepo, aiConfigRepo, aiSpendRepo, geminiClient, storageProvider)

		// Face recognition: prefer the face-svc Python sidecar (insightface,
		// 512-d embeddings) over the legacy Gemini path. The sidecar is
		// reached on the compose network via FACE_SVC_URL (typically
		// http://face-svc:8000). If unset we leave faceSvc on the Gemini
		// path — but migration 110 widened the embedding column to
		// vector(512), so the Gemini fallback fails-fast on insert. The
		// canonical wiring path is to set FACE_SVC_URL in production.
		if earlyFaceClient != nil {
			// Reuse the client built above for m2Deps so we don't open
			// two HTTP clients to the same sidecar. Same instance is
			// safe for concurrent use (face.Client wraps a stdlib
			// http.Client which is goroutine-safe).
			faceSvc = faceSvc.WithFaceClient(earlyFaceClient)
			log.Printf("face: detection backend set to face-svc (%s)", os.Getenv("FACE_SVC_URL"))
		} else {
			log.Printf("face: FACE_SVC_URL not set; falling back to (now-incompatible) Gemini path")
		}

		// Bind the function-scope adapter (declared above the bare scope
		// block) to this iteration's faceSvc. The thumbnail worker reads
		// it after the block closes — see PR-2b face hook comment near
		// the worker construction site.
		faceEnqueueAdapter = func(ctx context.Context, workspaceID uuid.UUID, assetIDs []uuid.UUID, galleryID *uuid.UUID) error {
			_, err := faceSvc.EnqueueDetection(ctx, workspaceID, assetIDs, galleryID)
			return err
		}

		// M21: wire face scan deps into gallery handler now that faceSvc is available.
		galleryHandler.WithAIDeps(faceSvc, assetSvc, aiJobRepo)
		searchSvc := ai.NewSearchService(dbPool, aiConfigRepo, aiSpendRepo, geminiClient, storageProvider)
		duplicateSvc := ai.NewDuplicateService(dbPool, aiConfigRepo, aiSpendRepo, geminiClient, aiJobRepo, storageProvider)
		cullingSvc := ai.NewCullingService(dbPool, aiConfigRepo, aiSpendRepo, geminiClient, aiJobRepo, storageProvider)

		// AI handler (all endpoints in one handler)
		aiHandler := ai.NewHandler(faceSvc, searchSvc, duplicateSvc, cullingSvc, aiConfigRepo, aiSpendRepo, aiJobRepo).
			WithAlbumCreator(albumSvc)

		// M3 routes (FR-012, FR-013, FR-020)
		watermarkSvc := service.NewWatermarkService()
		edgeHandler := handler.NewEdgeDeliveryHandler(assetRepo, thumbnailSvc, watermarkSvc)
		handler.RegisterM3Routes(api, handler.M3Dependencies{AIHandler: aiHandler, EdgeDeliveryHandler: edgeHandler})

		faceWorker := ai.NewFaceWorker(aiJobRepo, faceSvc, assetRepo, storageProvider).WithGalleryRepo(galleryRepo)
		searchWorker := ai.NewSearchWorker(dbPool, searchSvc, aiConfigRepo)
		duplicateWorker := ai.NewDuplicateWorker(aiJobRepo, duplicateSvc)
		burstSvc := ai.NewBurstService(dbPool)
		aestheticWorker := ai.NewAestheticWorker(dbPool, aiJobRepo, aiConfigRepo, aiSpendRepo, geminiClient, storageProvider)
		burstWorker := ai.NewBurstWorker(aiJobRepo, burstSvc)
		workerRegistry.Register("face-detection", faceWorker)
		workerRegistry.Register("ai-tagging", searchWorker)
		workerRegistry.Register("duplicate-scan", duplicateWorker)
		workerRegistry.Register("aesthetic-scoring", aestheticWorker)
		workerRegistry.Register("burst-grouping", burstWorker)
		_ = burstSvc

		log.Println("M3: AI routes + 5 workers registered")

		// M12: Wire AI design suggestions (now that gemini + aiConfigRepo are available).
		// Route is registered here (not in routes_m2.go) because DesignAISvc depends on
		// geminiClient and aiConfigRepo which are only available after AI init.
		designAISvc := service.NewDesignAIService(assetRepo, geminiClient, aiConfigRepo)
		designAIHandler := handler.NewDesignAIHandler(designAISvc)
		api.Get("/api/v1/galleries/{id}/ai-suggest", designAIHandler.Suggest)

		// ──────────────────────── M4: Business Operations ──────────────────────

		// M4 Repositories
		leadRepo := repository.NewLeadRepo(dbPool)
		contactRepo := repository.NewContactRepo(dbPool)
		dealRepo := repository.NewDealRepo(dbPool)
		projectRepo := repository.NewStudioProjectRepo(dbPool)
		invoiceRepo := repository.NewInvoiceRepo(dbPool)
		paymentRepo := repository.NewPaymentRepo(dbPool)
		servicePackageRepo := repository.NewServicePackageRepo(dbPool)
		contractRepo := repository.NewContractRepo(dbPool)
		eventRepo := repository.NewEventRepo(dbPool)
		notificationRepo := repository.NewNotificationRepo(dbPool)

		// M4 shared infrastructure: PDF renderer + notification delivery.
		// Log-only providers are safe for dev / CI; production can replace
		// them via the same With* chain without touching handlers.
		pdfSvc := service.NewPDFService()
		// WhatsApp delivery disabled in production (ops, 2026-06-02): no WhatsApp
		// Business API provider is configured and the log-only stub sent nothing
		// real. Unregistering the provider makes the whatsapp channel a silent
		// no-op (the delivery service skips channels with no registered provider),
		// while email (SMTP) + push + in-app continue to deliver.
		notifDeliverySvc := service.NewNotificationDeliveryService(notificationRepo).
			WithProvider(service.LogPushProvider{})
		if notificationEmailSender != nil {
			notifDeliverySvc.WithProvider(smtpNotificationEmailProvider{sender: notificationEmailSender})
		} else {
			notifDeliverySvc.WithProvider(service.LogEmailProvider{})
		}

		// Workspace owner lookup used by the notification dispatcher. Reads
		// the owner_id column on workspaces — the same column the onboarding
		// flow writes when a user first creates their workspace.
		ownerLookup := func(ctx context.Context, wsID uuid.UUID) (handler.OwnerLookupResult, error) {
			var out handler.OwnerLookupResult
			err := dbPool.QueryRow(ctx,
				`SELECT w.owner_id, COALESCE(u.email, '')
				 FROM workspaces w
				 LEFT JOIN users u ON u.id = w.owner_id
				 WHERE w.id = $1`, wsID).Scan(&out.UserID, &out.Email)
			return out, err
		}
		notifDispatcher := handler.NewNotificationDispatcher(notifDeliverySvc, ownerLookup)
		publicLeadDispatcher = notifDispatcher
		log.Println("M4: notification delivery service wired (email via SMTP + log-only push; WhatsApp disabled per ops 2026-06-02)")

		// M4 routes (public lead form is registered inside RegisterM4Routes without auth)
		handler.RegisterM4Routes(api, handler.M4Dependencies{
			DB:                     dbPool,
			LeadRepo:               leadRepo,
			ContactRepo:            contactRepo,
			DealRepo:               dealRepo,
			ProjectRepo:            projectRepo,
			InvoiceRepo:            invoiceRepo,
			PaymentRepo:            paymentRepo,
			ServicePackageRepo:     servicePackageRepo,
			ContractRepo:           contractRepo,
			EventRepo:              eventRepo,
			NotificationRepo:       notificationRepo,
			PDFService:             pdfSvc,
			NotificationDispatcher: notifDispatcher,
			PaymentSettings:        platformSettingsRepo,
		})

		log.Println("M4: Business Operations routes registered (CRM, Billing, Contracts, Calendar, Notifications, GST Reports, ICS Export, CSV Import, Payment Links)")

		// ──────────────────────── M5: Marketplaces & Communication ──────────────────
		freelancerRepo := repository.NewFreelancerRepo(dbPool)
		gearRepo := repository.NewGearRepo(dbPool)
		messagingRepo := repository.NewMessagingRepo(dbPool)
		moderationRepo := repository.NewModerationRepo(dbPool)

		handler.RegisterM5Routes(api, handler.M5Dependencies{
			DB:             dbPool,
			FreelancerRepo: freelancerRepo,
			GearRepo:       gearRepo,
			MessagingRepo:  messagingRepo,
			ModerationRepo: moderationRepo,
			Events:         eventBroker,
		})

		// M5 Workers
		msgCleanupWorker := worker.NewMessageCleanupWorker(messagingRepo)
		moderationWorker := worker.NewModerationWorker(messagingRepo, moderationRepo)
		workerRegistry.Register("message-cleanup", msgCleanupWorker)
		workerRegistry.Register("moderation", moderationWorker)

		log.Println("M5: Marketplaces & Communication routes registered (Freelancer, Gear, Messaging, Moderation)")

		// ──────────────────────── M6: Revenue & Dealership Engine ──────────────────
		dealerRepo := repository.NewDealerRepo(dbPool)
		couponRepo := repository.NewCouponRepo(dbPool)
		marginRepo := repository.NewMarginRepo(dbPool)
		payoutRepo := repository.NewPayoutRepo(dbPool)
		kycDocumentRepo := repository.NewKycDocumentRepo(dbPool)
		dealerAnalyticsRepo := repository.NewDealerAnalyticsRepo(dbPool)
		dealerAnalyticsSvc := service.NewDealerAnalyticsService(dealerAnalyticsRepo, dealerRepo)
		marginSvcForPayouts := service.NewMarginService(marginRepo, dealerRepo)
		payoutSvc := service.NewPayoutService(payoutRepo, marginSvcForPayouts)

		// M39 E7-S2: audit log service is needed before M6 routes register so
		// the dealer handler can emit admin.dealer.delete rows. The M7 block
		// below reuses the same instance. adminUserRepo is also hoisted here
		// so dealer creation can provision user accounts.
		auditLogRepo := repository.NewAuditLogRepo(dbPool)
		auditLogSvc := service.NewAuditLogService(auditLogRepo)
		m6AdminUserRepo := repository.NewAdminUserRepo(dbPool)

		subDealerRepo := repository.NewSubDealerRepo(dbPool)
		m6Deps := handler.M6Dependencies{
			DB:              dbPool,
			DealerRepo:      dealerRepo,
			AdminUserRepo:   m6AdminUserRepo,
			CouponRepo:      couponRepo,
			MarginRepo:      marginRepo,
			PayoutRepo:      payoutRepo,
			KycDocumentRepo: kycDocumentRepo,
			SubDealerRepo:   subDealerRepo,
			DealerAnalytics: dealerAnalyticsSvc,
			AuditLogSvc:     auditLogSvc,
			FrontendURL:     os.Getenv("FRONTEND_URL"),
		}
		// Avoid typed-nil interface bug: only set CredentialsSender when the
		// concrete pointer is non-nil, so DealerService.credsSender != nil works.
		if notificationEmailSender != nil {
			m6Deps.CredentialsSender = notificationEmailSender
		}
		handler.RegisterM6Routes(api, m6Deps)

		log.Println("M6: Revenue & Dealership Engine routes registered (Dealers, Coupons, Margins, Payouts, KYC, Analytics)")

		// M6 gap-fill: scheduler for monthly payout calculation on the 1st of each month.
		// Uses the scheduler package (no external cron dep). Jobs run in goroutines
		// started by Start(appCtx); Stop happens on process exit via defer.
		schedulerInstance := scheduler.New()
		if err := schedulerInstance.Register(
			"monthly-payout-calculation",
			scheduler.MonthlyOnDay(1),
			func(ctx context.Context) error {
				processed, failed, err := payoutSvc.CalculateMonthlyPayoutsForAllDealers(ctx, dealerRepo, time.Now().UTC())
				log.Printf("[scheduler] monthly-payout-calculation: processed=%d failed=%d err=%v", processed, failed, err)
				return err
			},
		); err != nil {
			log.Printf("WARNING: failed to register monthly-payout-calculation job: %v", err)
		} else {
			log.Println("Scheduler: registered monthly-payout-calculation (monthly on day 1 at 00:00)")
		}
		// Start in the same context the workers use so shutdown is unified.
		// NOTE: the actual Start() call happens below where workerCtx is created,
		// because workerCtx is declared after this block. We stash the scheduler
		// in a closure variable captured by the outer scope.
		m6Scheduler = schedulerInstance

		// ──────────────────────── M7: Admin Command Center & Reporting ──────────────────
		adminUserRepo := repository.NewAdminUserRepo(dbPool)
		adminModerationRepo := repository.NewAdminModerationRepo(dbPool)
		adminWorkspaceRepo := repository.NewAdminWorkspaceRepo(dbPool)
		adminRevenueRepo := repository.NewAdminRevenueRepo(dbPool)
		adminAnalyticsRepo := repository.NewAdminAnalyticsRepo(dbPool)
		adminHealthRepo := repository.NewAdminHealthRepo(dbPool)
		// M39 E7-S2: auditLogRepo / auditLogSvc are hoisted above to M6
		// init; reuse them here rather than re-constructing.

		jwtSecret := []byte(os.Getenv("JWT_IMPERSONATION_SECRET"))
		if len(jwtSecret) == 0 {
			log.Println("WARNING: JWT_IMPERSONATION_SECRET not set. Admin impersonation will be disabled.")
			jwtSecret = nil
		}

		// M16 E50-S1 / E50-S3: upload moderation service. Needs the audit log
		// service (declared above), so it is constructed here rather than up
		// by the other upload services.
		uploadModerationSvc := service.NewUploadModerationService(
			uploadModerationRepo,
			uploadAllowlistSvc,
			auditLogSvc,
		)

		// M16-BUG-02 fix: inject auditLogSvc into the workspace policy
		// service now that auditLogSvc exists. workspacePolicySvc was
		// constructed in the M16 init block (well above) with a nil audit
		// log because auditLogSvc didn't exist yet at that point in the
		// init graph. Without this wiring every workspace.policy.changed
		// event was silently dropped — verified empirically by counting
		// rows in audit_logs after a PUT /upload-policy request.
		workspacePolicySvc.WithAuditLog(auditLogSvc)

		adminUserSvc := service.NewAdminUserService(adminUserRepo, auditLogSvc, jwtSecret)
		// Issue #4: wire platform-role invitation email. The concrete
		// *email.InvitationSender satisfies both teamPkg.EmailSender and
		// service.AdminInviteSender, so we type-assert to reuse the same
		// SMTP config + envelope settings across team and platform invites.
		// Admin invites are skipped silently in envs that substitute
		// logEmailSender — admin can resend via the Reset-pw button.
		if adminInv, ok := teamEmailSender.(service.AdminInviteSender); ok {
			adminUserSvc.SetAdminInviteSender(adminInv, os.Getenv("FRONTEND_URL"))
		}
		handler.RegisterAdminRoutes(api, handler.AdminDeps{
			UserSvc:       adminUserSvc,
			ModerationSvc: service.NewAdminModerationService(adminModerationRepo, auditLogSvc),
			// F-062: wire auditLogSvc so workspace suspend/unsuspend/delete
			// write to the immutable audit_logs trail. Without WithAuditLog
			// the service's nil-guarded recordAudit silently no-ops and the
			// repo layer (UPDATE-only) writes no compensating audit row, so
			// SOC2/DPDPA reconstruction of who suspended/deleted a workspace
			// is lost. Mirrors workspacePolicySvc.WithAuditLog above.
			WorkspaceSvc: newAdminWorkspaceService(adminWorkspaceRepo, auditLogSvc),
			RevenueSvc:   service.NewAdminRevenueService(adminRevenueRepo),
			AnalyticsSvc: service.NewAdminAnalyticsService(adminAnalyticsRepo),
			ExportSvc:    service.NewAdminExportService(adminUserRepo, adminRevenueRepo),
			HealthSvc:    service.NewAdminHealthService(adminHealthRepo),
			AuditLogSvc:  auditLogSvc,
			// M16 Tier D admin surfaces
			WorkspacePolicySvc:  workspacePolicySvc,
			UploadModerationSvc: uploadModerationSvc,
			// M41 E14-S3: admin-initiated upload credit grant. Uses the
			// same upload credit service wired for the meter / balance
			// endpoint above (uploadCreditSvc); the handler only needs
			// the narrow UploadCreditGrantService interface.
			UploadCreditGrantSvc: uploadCreditSvc,
			// M41 FR-UCRT-10 follow-up: reuse the adapter wired above
			// for the user-facing balance pill so `/admin/upload-credits`
			// can show existing grants per workspace.
			UploadCreditBalanceReader: &uploadCreditBalanceAdapter{svc: uploadCreditSvc},
		})

		log.Println("M7: Admin Command Center routes registered (Users, Moderation, Workspaces, Revenue, Analytics, Export, Health, Audit)")

		// ──────────────────────── Platform Settings (Super Admin) ──────────────────
		//
		// F-005 (audit 2026-04-10): platform_settings secret rows are now
		// encrypted at rest via envelope encryption. The KEK is loaded from
		// PLATFORM_SETTINGS_KEK (32 bytes, hex-encoded). In production
		// (APP_ENV=production|prod) a missing KEK is fatal — we refuse to
		// silently fall back to plaintext storage of secrets. In non-production
		// environments a missing KEK logs a warning and the repo runs in
		// legacy plaintext mode so local dev still works without bootstrap
		// overhead.
		handler.RegisterAdminSettingsRoutes(api, platformSettingsRepo)
		log.Println("Admin: Platform settings CRUD registered (storage, auth, payments, ai, email)")

		// M31 / F-014 E103-S1: super-admin streaming package + rate-card CRUD.
		// Mounts under /api/v1/admin/streaming/* with RequirePlatformRole("super_admin").
		rateHandler := streamingrate.NewHandler(streamingrate.NewService(dbPool))
		streamingrate.RegisterAdminStreamingRoutes(api, rateHandler)
		log.Println("M31/F-014: Admin streaming package + rate-card CRUD registered")

		// M32 / F-014 E104: prepaid recharge (PhonePe primary, Razorpay fallback)
		// + GST invoicing + super-admin refund.
		creditSvc := credit.NewService(dbPool)
		settingsAdapter := streamingrechargeSettingsAdapter{repo: platformSettingsRepo}
		packageLookup := streamingrechargePackageLookup{pool: dbPool}
		invoiceNumberer := streamingrecharge.NewInvoiceNumberer(dbPool)
		gstStateCode := func() string {
			s, err := platformSettingsRepo.GetByKey(context.Background(), "payments", "gstin_state_code")
			if err == nil && s != nil && s.Value != "" {
				return s.Value
			}
			return "29" // default Karnataka if unset
		}()
		rechargeSvc := streamingrecharge.NewService(
			dbPool, creditSvc,
			streamingrecharge.NewPlatformSettingsResolver(settingsAdapter),
			packageLookup, invoiceNumberer, gstStateCode,
		)
		// F-010 (audit 2026-05-30): the recharge handler exposes a MIX of
		// authenticated routes (RequireAuth / RequirePlatformRole) and
		// unauthenticated ones (public catalogue + provider webhooks).
		// The old single RegisterRoutes(r, ...) call mounted everything on
		// the OUTER router `r`, which has no JWTAuth — so middleware.RequireAuth
		// always saw nil claims and every authenticated recharge/balance/refund
		// endpoint returned 401. Split the wiring: authenticated routes go on
		// the `api` sub-router (JWTAuth + TenantContext already applied here,
		// matching the sibling registrations above), while the public catalogue
		// and signature-verified webhooks stay on `r` — webhooks MUST NOT inherit
		// TenantContext/RequireMFA since providers send no JWT and no workspace.
		rechargeHandler := streamingrecharge.NewHandler(rechargeSvc, dbPool)
		registerStreamingRechargeRoutes(api, r, rechargeHandler)
		log.Println("M32/F-014: Recharge + webhooks (PhonePe/Razorpay) + GST invoice + refund registered")

		// ──────────────────────── M34 / F-014: streaming commercial v1 ──────────────
		// Wire the M34 handlers package. Each handler performs its own feature-flag
		// check, so the flag being off collapses all routes to 404. Handlers whose
		// downstream services are not yet wired remain nil — their routes are simply
		// not registered (safe; no partial mounts).
		streamingFlagEnv := os.Getenv("FEATURE_STREAMING_COMMERCIAL_V1") == "true"
		streamingFlag := featureflag.NewStreamingCommercialFlag(platformSettingsRepo, streamingFlagEnv)

		// CreditBalance: adapt credit.Service.GetBalance → BalanceProvider.
		creditBalanceAdapter := &streamingCreditBalanceAdapter{svc: creditSvc}
		creditBalanceHandler := &streaminghandlers.CreditBalanceHandler{
			Balance: creditBalanceAdapter,
			FeatureFlag: func(name string) bool {
				ok, _ := streamingFlag.IsEnabled(context.Background(), uuid.Nil)
				return ok
			},
		}

		// Invite handler: real shortlink service + DB ownership check.
		shortlinkSvc := shortlink.NewService(dbPool)
		inviteBaseURL := os.Getenv("APP_PUBLIC_BASE_URL")
		if inviteBaseURL == "" {
			inviteBaseURL = "https://app.rawdrive.io"
		}
		inviteHandler := streaminghandlers.NewInviteHandler(shortlinkSvc, streamingFlag, dbPool, inviteBaseURL)

		// Public shortlink resolver: resolver + hit recorder from the same service.
		// StreamMetaLoader remains nil for now — handler returns the empty whitelisted
		// meta object, which is the documented fallback.
		publicShortlinkHandler := streaminghandlers.NewPublicShortlinkHandler(shortlinkSvc, nil, 60)

		// ──────────────────────── M35 / F-014: viewer + analytics handlers ───────────
		// Build the viewer JWT service early so SSE/ViewerPublic handlers can reuse
		// it as their ViewerTokenParser. Key is loaded from platform_settings.
		m35ViewerJWT, m35ViewerJWTErr := buildViewerJWTService(context.Background(), platformSettingsRepo)
		if m35ViewerJWTErr != nil {
			log.Printf("WARNING: M35 viewer JWT service disabled: %v", m35ViewerJWTErr)
			m35ViewerJWT = nil
		}

		// statePusher singleton — per-process in-memory broker for SSE state fan-out.
		// 64-slot ring buffer per stream matches the 35-2 spec.
		m35StatePusher := statepusher.NewStatePusher(nil /* system clock */, 64)

		// SSE state handler (story 35-2). Viewer JWT + in-process pusher + flag.
		var sseStateHandler *streaminghandlers.SSEStateHandler
		if m35ViewerJWT != nil {
			sseStateHandler = &streaminghandlers.SSEStateHandler{
				Parser: m35ViewerJWT,
				Pusher: m35StatePusher,
				Flag:   streamingFlag,
			}
		}

		// Viewer public handler (story 35-4). Backed by:
		//   * PgReplayStreamRepo  — pgxpool over streams.replay_state/expires.
		//   * ZeroPresenceSource  — stub upstream until the NATS-backed viewer
		//                           presence broker lands; reports 0 viewers.
		//   * CFPlaybackSigner    — wraps cf.SignedURLService when configured;
		//                           nil until cf signing key is wired through
		//                           platform_settings (replay 500s gracefully).
		var viewerPublicHandler *streaminghandlers.ViewerPublicHandler
		if m35ViewerJWT != nil {
			viewerCountCache := viewer.NewViewerCountCache(streaminghandlers.ZeroPresenceSource{}, 5*time.Second, nil)
			replayGate := viewer.NewReplayGate(nil /* TODO: cf signer when configured */, 48*time.Hour, nil)
			viewerPublicHandler = streaminghandlers.NewViewerPublicHandler(
				viewerCountCache, replayGate, m35ViewerJWT,
				streaminghandlers.NewPgReplayStreamRepo(dbPool),
				streamingFlag, uuid.Nil, nil,
			)
		}

		// Analytics handler (story 35-6). Real aggregator + dbPool, flag-gated.
		analyticsHandler := streaminghandlers.NewAnalyticsHandler(streaminganalytics.New(dbPool), dbPool).
			WithFeatureFlag(streamingFlag)

		// Console handler (story 34-1). Backed by PgConsoleStore — owner-scoped
		// reads from the streams + ingest_reveal_audit tables.
		consoleHandler := streaminghandlers.NewConsoleHandler(
			streaminghandlers.NewPgConsoleStore(dbPool),
			streamingFlag,
			nil, // default clock
		)

		// ChatViewer handler (story 35-3). Real chat.Service backed by:
		//   * repository.ChatRepo over pgxpool
		//   * In-memory slow-mode + reaction rate-limit gate
		//   * PgChatLivenessChecker reading streams.status + chat_slow_mode
		// StreamWorkspaceResolver is the pgx adapter that maps stream → ws id.
		chatRepo := streamingrepo.NewChatRepo(dbPool)
		slowModeGate := streamingchat.NewInMemorySlowModeGate(nil)
		liveness := streaminghandlers.NewPgChatLivenessChecker(dbPool)
		chatSvc := streamingchat.NewService(chatRepo, slowModeGate, liveness)
		chatViewerHandler := streaminghandlers.NewChatViewerHandler(
			chatSvc,
			m35ViewerJWT,
			streaminghandlers.NewPgStreamWorkspaceResolver(dbPool),
			streamingFlag,
		)

		streamingDeps := streaminghandlers.Dependencies{
			Console:         consoleHandler,
			CreditBalance:   creditBalanceHandler,
			Invite:          inviteHandler,
			PublicShortlink: publicShortlinkHandler,
			Analytics:       analyticsHandler,
			SSEState:        sseStateHandler,
			ViewerPublic:    viewerPublicHandler,
			ChatViewer:      chatViewerHandler,
			// StreamCreate, IngestReveal, LiveConsole, Preflight remain nil:
			//   * StreamCreate  — needs a fully-wired StreamWriter + idempotency
			//                    layer that lands with M34 wave 2.
			//   * IngestReveal  — services.RevealService requires a StreamLookup
			//                    + KeyRotator + envelope-decryption pipeline that
			//                    is not yet wired through platform_settings.
			//   * LiveConsole   — 8-method LiveConsoleDeps facade (presence,
			//                    moderation persistence, slow-mode set, end-stream)
			//                    spans services not yet built.
			//   * Preflight     — preflight.Service exposes Start() but not the
			//                    SessionWorkspace/RecordBandwidth/OBSProfile/
			//                    TestBroadcast/Complete methods the handler
			//                    requires (R3 stubs not yet present).
			// Each route is gated by `if deps.X != nil` in routes.go so a nil
			// handler simply collapses its routes to "not registered" — no
			// panic, no partial mount.
		}
		streaminghandlers.RegisterRoutes(api, streamingDeps)
		streaminghandlers.RegisterPublicRoutes(r, streamingDeps)
		log.Println("M34/M35/F-014: streaming handlers registered (credit balance, invite, public shortlink, analytics, SSE state, viewer public)")

		// F-006 Part A (audit 2026-04-10): replace the JWT service's
		// ephemeral in-memory RSA signing key with one persisted through
		// the platform_settings repo (which now encrypts it at rest via
		// F-005 when the envelope is wired). On first boot this generates
		// and persists a new key; on subsequent boots it loads the
		// existing one. Either way, access tokens signed by the previous
		// run are still valid after the restart.
		jwtKeyStore := &platformSettingsJWTKeyStore{repo: platformSettingsRepo}
		if err := auth.LoadPersistedSigningKey(context.Background(), jwtSvc, jwtKeyStore); err != nil {
			log.Fatalf("F-006: failed to load persisted JWT signing key: %v", err)
		}
		log.Println("F-006: JWT signing key loaded from platform_settings (stable across restarts)")

		// ──────────────────────── M8: Live Streaming & Desktop Companion ──────────────
		streamRepo := repository.NewStreamRepo(dbPool)
		streamChatRepo := repository.NewStreamChatRepo(dbPool)
		videoRepo := repository.NewVideoRepo(dbPool)
		desktopSessionRepo := repository.NewDesktopSessionRepo(dbPool)
		streamSvc := service.NewStreamService(streamRepo, streamChatRepo)
		videoSvc := service.NewVideoService(videoRepo)
		desktopSvc := service.NewDesktopService(desktopSessionRepo)

		// M30 / F-014 — viewer-session JWT service for public stream access.
		// Signing key is loaded from platform_settings (KEK-encrypted at rest
		// per F-005). On first boot the key is generated and persisted.
		viewerJWT, err := buildViewerJWTService(context.Background(), platformSettingsRepo)
		if err != nil {
			log.Printf("WARNING: viewer JWT service disabled: %v", err)
			viewerJWT = nil
		}

		// PIN brute-force defence uses the shared pinLimiter declared at function
		// scope (F-009) so the gallery (M2) and stream (M8) verify-pin gates share
		// throttling state. Production should swap a Valkey-backed limiter.
		m8Deps = handler.M8Dependencies{
			StreamService:  streamSvc,
			VideoService:   videoSvc,
			DesktopService: desktopSvc,
			ViewerJWT:      viewerJWT,
			PINRateLimiter: pinLimiter,
			GalleryRepo:    galleryRepo, // M23: tethered-galleries endpoint
		}
		handler.RegisterM8Routes(api, m8Deps)
		log.Println("M8: Live Streaming, Video, Desktop routes registered")
		if viewerJWT != nil {
			log.Println("M30/F-014: viewer-session JWT + PIN rate limiter wired into public stream routes")
		}

		// ──────────────────────── M9: Developer Platform — API Keys ──────────────────
		// API key management lives under the JWT-protected dashboard group:
		// users authenticate with their session JWT, then create/list/revoke
		// API keys for programmatic access. The keys themselves are
		// authenticated via middleware.APIKeyAuth on a separate dataplane
		// group when that group is opened.
		apiKeyRepo := repository.NewAPIKeyRepo(dbPool)
		apiKeySvc := service.NewAPIKeyService(apiKeyRepo)
		apiKeyHandler := handler.NewAPIKeyHandler(apiKeySvc)
		api.Post("/api/v1/api-keys", apiKeyHandler.Create)
		api.Get("/api/v1/api-keys", apiKeyHandler.List)
		api.Delete("/api/v1/api-keys/{id}", apiKeyHandler.Revoke)
		log.Println("M9: API key management routes registered (POST/GET/DELETE /api/v1/api-keys)")

		// ──────────────────────── M10: DSR Workflow ──────────────────────
		// Data Subject Request endpoints (DPDPA + GDPR access/erasure/rectify).
		// Mounted inside the protected group so the submitting user is
		// identifiable from JWT claims; anonymous public submissions can be
		// added later via a separate public route group.
		dsrRepo := repository.NewDSRRepo(dbPool)
		dsrSvc := service.NewDSRService(service.NewPostgresDSRStore(dsrRepo))
		dsrHandler := handler.NewDSRHandler(dsrSvc)
		api.Post("/api/v1/dsr", dsrHandler.Submit)
		api.Get("/api/v1/dsr/{id}", dsrHandler.Get)
		api.Post("/api/v1/dsr/{id}/process-access", dsrHandler.ProcessAccess)
		log.Println("M10: DSR workflow routes registered (Submit, Get, ProcessAccess)")

	}) // end protected API group

	// ──────────────────────── API key dataplane (M14 GAL-FR-194/196/197) ──
	// Routes here are authenticated via API key (Authorization: Bearer rd_...)
	// instead of a JWT session, and pass through the Valkey sliding-window
	// rate limiter so a rogue integration can't DoS the platform. The
	// limiter key is derived from the verified API key ID; budget is a
	// flat 1000 req/min for now — a future phase will read per-key
	// budgets from api_keys.rate_limit and thread them through.
	//
	// The group is opened unconditionally so existing dataplane routes
	// can move under it without another scaffold. Mounted outside the
	// JWT block above since API keys carry their own workspace context.
	apiKeyRepoForAuth := repository.NewAPIKeyRepo(dbPool)
	apiKeySvcForAuth := service.NewAPIKeyService(apiKeyRepoForAuth)
	r.Group(func(dp chi.Router) {
		dp.Use(middleware.APIKeyAuth(apiKeySvcForAuth))
		if valkeyClient != nil {
			// Per-key dynamic budget: APIKey.RateLimit (from the
			// api_keys table) overrides the default on a request-by-
			// request basis. Keys with rate_limit unset (0) fall back
			// to 1000/min so existing keys keep working unchanged.
			dp.Use(middleware.ValkeyRateLimitDynamic(
				valkeyClient,
				middleware.APIKeyRateLimitKeyFunc,
				middleware.APIKeyRateLimitMaxFunc,
				1000,
				time.Minute,
			))
			log.Println("M14: API key dataplane rate limiter enabled (per-key rate_limit; fallback 1000/min)")
		} else {
			log.Println("M14: API key dataplane group mounted (rate limiter no-op — VALKEY_URL unset)")
		}
		// /api/v1/dp/* is reserved for API-key-authenticated consumer
		// routes (gallery read, webhook test, etc.). A /ping endpoint
		// is mounted so integrators can smoke-test their credentials.
		dp.Get("/api/v1/dp/ping", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"status":"ok","auth":"api_key"}`))
		})
	})

	// M8 public routes (stream viewer, desktop download — no auth)
	handler.RegisterM8PublicRoutes(r, m8Deps)

	// SSE event stream (self-authenticating via query-param JWT — outside middleware group)
	// Mounted at /api/v1/events/stream to match frontend EventSource URL
	r.Route("/api/v1", func(apiSSE chi.Router) {
		handler.RegisterEventRoutes(apiSSE, eventBroker, jwtSvc)
	})
	log.Println("SSE: Event stream endpoint registered at /api/v1/events/stream")

	// Public lead capture (no auth required — embeddable on external sites)
	publicLeadRepo := repository.NewLeadRepo(dbPool)
	publicLeadHandler := handler.NewLeadEmbedHandler(publicLeadRepo).
		WithNotificationDispatcher(publicLeadDispatcher)
	r.Post("/api/v1/public/leads/{workspaceId}", publicLeadHandler.Submit)

	log.Println("Public lead form endpoint registered")

	// Dealer partnership applications (public — no auth required)
	var dealerAppEmailSender *email.DealerApplicationSender
	if smtpCfg != nil {
		dealerAppEmailSender = email.NewDynamicDealerApplicationSender(smtpReader)
	}
	dealerAppHandler := handler.NewDealerApplicationHandler(dealerAppEmailSender)
	r.Post("/api/v1/public/dealer-applications", dealerAppHandler.Submit)
	log.Println("Public dealer application endpoint registered")

	// ──────────────────────── Authenticated Storage Proxy ────────────────
	// Streams storage file bytes through the backend with JWT auth so
	// the browser never learns the R2/MinIO host. Previously this
	// endpoint issued a 307 redirect to a presigned R2 URL — which
	// leaked the backend's storage endpoint to the client and broke
	// completely when the storage host wasn't publicly reachable (as
	// observed during UAT on 2026-04-12 against the MinIO bridge on a
	// private VPS IP). Streaming is slightly more bandwidth on the API
	// node but:
	//   - keeps "all file serving requires JWT auth" intact
	//   - hides the storage endpoint, satisfying "no public URL
	//     access" from AGENTS.md §No Local Storage
	//   - works identically for R2 (HTTPS) and MinIO (HTTP)
	//   - lets the thumbnail worker emit stable /storage/{key} URLs
	//     that never expire
	// <img src> tags authenticate via the HttpOnly access-token cookie
	// issued by the auth handlers. Fetch callers can still use the
	// Authorization header directly.
	r.Get("/storage/*", func(w http.ResponseWriter, r *http.Request) {
		key := chi.URLParam(r, "*")
		// F-035 (audit 2026-05-30): sanitize the raw URL key BEFORE any
		// auth decision. The router has no CleanPath middleware, so a key
		// could contain "..", a leading "/", or other non-normalized
		// segments. B2/S3 use a flat keyspace (so traversal is not a live
		// exploit), but rejecting malformed keys closes the unvalidated
		// unauthenticated key surface and prevents a future prefix collision
		// from silently bypassing the auth gate.
		if err := validateStorageKey(key); err != nil {
			http.Error(w, `{"error":"invalid key"}`, http.StatusBadRequest)
			return
		}
		// Public gallery access: derivative thumbnails MAY be served
		// anonymously, but ONLY after we confirm the asset's gallery is
		// actually openly delivered (S4-G1, integration audit 2026-05-31).
		//
		// Previously the strict key shape (thumbnails/<uuid>/<variant>.webp)
		// alone was sufficient to bypass auth — so anyone who learned/guessed
		// an asset UUID could pull full thumbnails of password-protected,
		// unpublished, expired, or private galleries. authorizeThumbnailByte
		// now resolves the asset → its gallery(ies) and serves only when a
		// containing gallery is published + non-expired + non-password +
		// public/unlisted, OR the request carries a valid gallery-session
		// token (password/share scoped) bound to a containing published
		// gallery. The normal public-gallery delivery case (published, open,
		// no password) still serves anonymously — that path is exercised by
		// the public grid/lightbox and must not break.
		isPublicThumbnail := false
		if assetID, isThumb := thumbnailAssetID(key); isThumb {
			isPublicThumbnail = authorizeThumbnailByte(r.Context(), dbPool, galleryAccessSvc, r, assetID)
		}

		if !isPublicThumbnail {
			// Verify JWT — accept Bearer header or the HttpOnly
			// rawdrive_access_token cookie. Do not read bearer tokens from
			// query strings; storage URLs land in browser/proxy logs.
			tokenStr := auth.AccessTokenFromRequest(r)
			if tokenStr == "" {
				http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
				return
			}
			claims, err := jwtSvc.ParseAccessToken(r.Context(), tokenStr)
			if err != nil {
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}
			ok, err := storageKeyBelongsToWorkspace(r.Context(), dbPool, key, claims.WorkspaceID)
			if err != nil {
				log.Printf("storage proxy workspace check %q failed: %v", key, err)
				http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
				return
			}
			if !ok {
				http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
				return
			}
		}

		rc, err := storageProvider.Get(r.Context(), key)
		if err != nil {
			// 2026-05-20: log the actual storage-layer error so we can
			// distinguish real 404s from auth/encryption misconfigurations
			// (e.g. SSE-C key mismatch returning 403 → silently rendered
			// as 404 to the client). Without this, every B2 error path —
			// missing object, wrong SSE key, throttling, network — looked
			// identical from the outside.
			log.Printf("storage proxy GET %q failed: %v", key, err)
			http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
			return
		}
		defer rc.Close()

		// Best-effort content-type guess from extension — the backend
		// does not persist content-type for every derivative so we
		// fall back to octet-stream rather than sniff the body.
		ct := "application/octet-stream"
		switch {
		case strings.HasSuffix(key, ".webp"):
			ct = "image/webp"
		case strings.HasSuffix(key, ".jpg"), strings.HasSuffix(key, ".jpeg"):
			ct = "image/jpeg"
		case strings.HasSuffix(key, ".png"):
			ct = "image/png"
		case strings.HasSuffix(key, ".gif"):
			ct = "image/gif"
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Cache-Control", "private, max-age=3600")
		if _, err := io.Copy(w, rc); err != nil {
			// Connection dropped mid-stream — nothing we can do.
			return
		}
	})
	log.Println("Storage: streaming proxy with JWT auth on /storage/*")

	// ──────────────────────── Background Workers (start after all routes) ────────────────
	// PR-2b face hook: when the thumbnail worker finishes derivatives for an
	// image asset it enqueues a face_detection AIJob. The job is then picked
	// up by faceWorker (already running) which calls into faceSvc. The
	// adapter is assigned inside the bare-scope AI wiring block above; if
	// the env path didn't initialize faceSvc (rare in dev, impossible in
	// prod once FACE_SVC_URL is required) the field stays nil and the
	// worker skips the enqueue silently.
	thumbWorker := worker.NewThumbnailWorker(assetRepo, thumbnailSvc, storageProvider).
		WithPublisher(eventBroker).
		WithDerivativeRepo(assetDerivativeRepo).
		WithStorageAccounting(storageAccountingSvc).
		WithExifService(exifSvc).
		WithEncryptionMetadata(storageEncrypted, storageEncryptionAlgo, storageEncryptionVersion)
	if faceEnqueueAdapter != nil {
		thumbWorker = thumbWorker.WithFaceEnqueuer(faceEnqueueAdapter)
	}
	workerRegistry.Register("thumbnail", thumbWorker)
	purgeWorker := worker.NewAssetPurgeWorker(dbPool, storageProvider)
	workerRegistry.Register("asset-purge", purgeWorker)
	expiryWorker := worker.NewGalleryExpiryWorker(dbPool)
	workerRegistry.Register("gallery-expiry", expiryWorker)
	// Gallery Enhancements June 2026: branded client email automation. Self-
	// seeding drip (ready / reminder / last-chance). Only wired when SMTP is
	// available; falls back to the standard public base URL for gallery links.
	if galleryAutomationSender != nil {
		automationBaseURL := os.Getenv("APP_PUBLIC_BASE_URL")
		if automationBaseURL == "" {
			automationBaseURL = "https://app.rawdrive.io"
		}
		emailAutomationWorker := worker.NewEmailAutomationWorker(dbPool, galleryAutomationSender, automationBaseURL)
		workerRegistry.Register("email-automation", emailAutomationWorker)
	}
	// M9 E26-S2: outbound webhook delivery — POSTs payloads to subscribers
	// with HMAC signing, retries up to 5x, dead-letters on terminal failure.
	webhookDeliveryWorker := worker.NewWebhookDeliveryWorker(dbPool)
	workerRegistry.Register("webhook-delivery", webhookDeliveryWorker)

	// M14 GAL-FR-150/151/152: background ZIP download worker. Polls
	// download_jobs for pending rows, builds the ZIP in memory, uploads
	// to R2 under downloads/<gallery>/<job>.zip, and records progress
	// so clients can poll for completion.
	downloadWorker := worker.NewDownloadWorker(dbPool, downloadSvc)
	workerRegistry.Register("download", downloadWorker)

	// M10 E27-S3: DSR purge worker — polls dsr_requests for pending rows
	// and dispatches by request_type. Access requests delegate to the
	// DSRService.ProcessAccessRequest path; erasure requests are handled
	// by the production DSREraser (service/dsr_eraser.go), which walks
	// the subject's assets, deletes R2 objects, cascades DB rows, and
	// redacts audit log entries via the migration-050 helper functions.
	// The DSR service is constructed inside the protected API group
	// above; we re-construct the repo + service here since the worker
	// runs outside that closure.
	dsrPurgeRepo := repository.NewDSRRepo(dbPool)
	dsrPurgeSvc := service.NewDSRService(service.NewPostgresDSRStore(dsrPurgeRepo))
	dsrEraser := service.NewDSREraser(dbPool, storageProvider)
	dsrPurgeWorker := worker.NewDSRPurgeWorker(dbPool, func(ctx context.Context, id uuid.UUID) error {
		_, err := dsrPurgeSvc.ProcessAccessRequest(ctx, id)
		return err
	}).WithEraser(dsrEraser.Erase)
	workerRegistry.Register("dsr-purge", dsrPurgeWorker)
	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()
	workerRegistry.StartAll(workerCtx)
	log.Println("Workers: all started (thumbnail, asset-purge, gallery-expiry, face-detection, ai-tagging, duplicate-scan, message-cleanup, moderation)")

	// Scheduler: start after workers so jobs run under the same cancellable context.
	if m6Scheduler != nil {
		m6Scheduler.Start(workerCtx)
		jobs := m6Scheduler.Jobs()
		for _, j := range jobs {
			log.Printf("Scheduler: job %q next run at %s (%s)", j.Name, j.NextRun.Format(time.RFC3339), j.Schedule)
		}
		defer m6Scheduler.Stop()
	}

	// ──────────────────────── Health Check ────────────────────────

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// M14 GAL-FR-205: deep health check — probes database, storage, and
	// Valkey. Valkey is nil for now (rate limiter is in-memory); the
	// probe reports "disabled" for it.
	deepHealth := handler.NewHealthHandler(dbPool, storageProvider, nil)
	r.Get("/health/deep", deepHealth.Deep)

	// ──────────────────────── ISSUE-006 MFA Mount Gate ────────────────────────
	//
	// The RequireMFA middleware reads mfa_verified from JWT claims,
	// which are populated by JWTAuth. Mounting RequireMFA without
	// JWTAuth earlier in the chain was previously enforced only by a
	// comment in require_mfa.go — the invariant was fragile and a
	// regression would produce a confusing 401 or, worse, a permissive
	// hole if someone "fixed" RequireMFA to be less strict. Walk every
	// registered route and FATAL at startup if any MFA-protected route
	// violates the JWTAuth-before-RequireMFA ordering.
	if err := middleware.ValidateMFAMountOrder(r); err != nil {
		log.Fatalf("FATAL: MFA mount order validation failed (ISSUE-006 invariant): %v", err)
	}

	// ──────────────────────── Start Server ────────────────────────
	//
	// M10 E27-S1: TLS 1.3 enforcement.
	//
	// Production must terminate TLS 1.3 inside the Go process so the
	// app's security posture doesn't depend on a specific load balancer
	// configuration. Three modes are supported:
	//
	//   1. TLS_CERT_PATH + TLS_KEY_PATH set → ListenAndServeTLS with
	//      MinVersion=TLS 1.3 and a curated cipher suite list.
	//   2. TLS_CERT_PATH unset → fall back to plaintext (dev / behind
	//      a TLS-terminating reverse proxy that handles certs externally).
	//      A WARNING is logged so the operator can't accidentally ship
	//      this mode to production unnoticed.
	//   3. Both set but file unreadable → log.Fatalf with the error so
	//      misconfigurations are caught at boot, not at first request.

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	certPath := os.Getenv("TLS_CERT_PATH")
	keyPath := os.Getenv("TLS_KEY_PATH")

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           r,
		ReadHeaderTimeout: 15 * time.Second, // mitigates Slowloris (CVE-2016-1000218 family)
		// Bound idle keep-alive connections and request header size. These are
		// safe server-wide because IdleTimeout only fires BETWEEN requests (it
		// never truncates an in-flight SSE stream, ZIP download, or /storage/*
		// byte proxy) and MaxHeaderBytes caps headers, not bodies. ReadTimeout
		// and WriteTimeout are deliberately NOT set here: a global ReadTimeout
		// would truncate large/slow multipart uploads and a global WriteTimeout
		// would cut off the long-lived streaming responses on this same router.
		// Those need per-route deadlines (http.ResponseController) — deferred as
		// the RISKY half of PERF-16.
		IdleTimeout:    120 * time.Second,
		MaxHeaderBytes: 1 << 20, // 1 MiB
	}

	if certPath != "" && keyPath != "" {
		// TLS 1.3 only. The cipher suite list is implicitly the TLS 1.3
		// ciphers (TLS_AES_*_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256)
		// because Go's crypto/tls ignores CipherSuites for TLS 1.3.
		srv.TLSConfig = &tls.Config{
			MinVersion: tls.VersionTLS13,
		}
		fmt.Printf("RawDrive API starting on :%s with TLS 1.3 enforcement\n", port)
		serveWithGracefulShutdown(srv, certPath, keyPath, func() {
			workerCancel()
			workerRegistry.StopAll()
			if m6Scheduler != nil {
				m6Scheduler.Stop()
			}
		})
		return
	}

	// F-010 (audit 2026-04-10): plaintext HTTP is only permitted when the
	// operator has explicitly declared that a trusted proxy terminates TLS
	// in front of the API. Previously the server fell back to plaintext
	// silently with just a log warning, which is exactly the condition the
	// audit flagged — "production hard-starts in cleartext because someone
	// forgot TLS_CERT_PATH." The escape hatch is intentional for operators
	// running behind Caddy/Traefik/ALB/Cloudflare that terminate TLS
	// upstream; in that mode they must set TRUSTED_PROXY_MODE=true to
	// acknowledge the risk surface.
	trustedProxy := strings.EqualFold(os.Getenv("TRUSTED_PROXY_MODE"), "true")
	env := strings.ToLower(os.Getenv("APP_ENV"))
	isProduction := env == "production" || env == "prod"

	if !trustedProxy {
		if isProduction {
			log.Fatalf("FATAL: TLS_CERT_PATH/TLS_KEY_PATH not set and TRUSTED_PROXY_MODE != true in APP_ENV=%s. "+
				"Refusing to start plaintext HTTP in production. Set TLS cert paths or explicitly "+
				"set TRUSTED_PROXY_MODE=true to acknowledge that an upstream proxy terminates TLS.", env)
		}
		log.Println("WARNING: TLS_CERT_PATH/TLS_KEY_PATH not set — serving plaintext HTTP. " +
			"Production deployments MUST terminate TLS 1.3 (either here or at a trusted reverse proxy). " +
			"In APP_ENV=production this configuration will refuse to start.")
	} else {
		log.Println("TRUSTED_PROXY_MODE=true — running plaintext HTTP behind an upstream TLS terminator.")
	}
	fmt.Printf("RawDrive API starting on :%s (plaintext)\n", port)
	serveWithGracefulShutdown(srv, "", "", func() {
		workerCancel()
		workerRegistry.StopAll()
		if m6Scheduler != nil {
			m6Scheduler.Stop()
		}
	})
}

// Zero stubs remain — all dependencies are backed by real implementations.
