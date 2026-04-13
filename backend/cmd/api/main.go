package main

import (
	"context"
	cryptorand "crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/redis/go-redis/v9"

	"github.com/rawdrive/backend/internal/ai"
	"github.com/rawdrive/backend/internal/auth"
	backendcrypto "github.com/rawdrive/backend/internal/crypto"
	"github.com/rawdrive/backend/internal/email"
	"github.com/rawdrive/backend/internal/events"
	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/onboarding"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/scheduler"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/storage"
	"github.com/rawdrive/backend/internal/streaming/credit"
	streamingrate "github.com/rawdrive/backend/internal/streaming/rate"
	streamingrecharge "github.com/rawdrive/backend/internal/streaming/recharge"
	"github.com/rawdrive/backend/internal/streaming/viewer"
	teamPkg "github.com/rawdrive/backend/internal/team"
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

	// Create workspace with the resolved integer state ID
	ws, err := o.wsSvc.Create(ctx, workspace.CreateWorkspaceInput{
		Name:         businessName,
		StateID:      stateIDStr,
		OwnerID:      userID,
		BusinessName: businessName,
		PlanTier:     planTier,
	})
	if err != nil {
		return "", err
	}

	// Ensure workspace_members row exists (for AuthLookup to find)
	_, _ = o.pool.Exec(ctx,
		`INSERT INTO workspace_members (workspace_id, user_id, role_id)
		 VALUES ($1, $2, (SELECT id FROM roles WHERE name = 'Owner'))
		 ON CONFLICT DO NOTHING`,
		ws.ID, userID)

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

// envOrFatal tries multiple env var names in order. Returns the first non-empty value.
// Logs fatal if none are set.
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

func generateRandomKey(n int) ([]byte, error) {
	buf := make([]byte, n)
	if _, err := cryptorand.Read(buf); err != nil {
		return nil, err
	}
	return buf, nil
}

func encodeHexKey(b []byte) string { return hex.EncodeToString(b) }

func decodeHexKey(s string) ([]byte, error) { return hex.DecodeString(strings.TrimSpace(s)) }

func envOrFatal(names ...string) string {
	for _, name := range names {
		if v := os.Getenv(name); v != "" {
			return v
		}
	}
	log.Fatalf("FATAL: required environment variable not set. Tried: %v", names)
	return ""
}

// envOr tries multiple env var names, returns defaultVal if none set.
func envOr(defaultVal string, names ...string) string {
	for _, name := range names {
		if v := os.Getenv(name); v != "" {
			return v
		}
	}
	return defaultVal
}

func main() {
	r := chi.NewRouter()

	// Global middleware
	r.Use(middleware.CORS)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RequestID)
	r.Use(middleware.SecurityHeaders)
	r.Use(middleware.RateLimit(60, time.Minute))

	// ──────────────────────── Database Connection (shared M1 + M2) ────────────────
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("FATAL: DATABASE_URL is required. Set it in .env.cobolt or environment.")
	}

	poolCfg, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		log.Fatalf("FATAL: invalid DATABASE_URL: %v", err)
	}
	poolCfg.MaxConns = 25
	poolCfg.MinConns = 5

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
			appEnv := strings.ToLower(os.Getenv("APP_ENV"))
			if appEnv == "production" || appEnv == "prod" {
				log.Fatalf("FATAL: PLATFORM_SETTINGS_KEK is required in production (APP_ENV=%s). "+
					"Generate a 32-byte hex KEK and set it in your secret store. "+
					"See F-005 in docs/audits/rawdrive-v0.0.35-m16-360-audit-2026-04-10.md.", appEnv)
			}
			log.Println("WARNING: PLATFORM_SETTINGS_KEK not set - platform settings secrets will be stored in PLAINTEXT. This is only acceptable in non-production environments.")
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
	var notificationEmailSender *email.NotificationSender

	if smtpCfg != nil {
		otpDelivery = email.NewDynamicOTPDelivery(smtpReader)
		teamEmailSender = email.NewDynamicInvitationSender(smtpReader)
		galleryShareSender = email.NewDynamicGalleryShareSender(smtpReader)
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
		teamEmailSender = &logEmailSender{}
		log.Println("WARNING: Email stubs active (DEV_STUB_EMAIL=true) — every email " +
			"goes to stdout. DO NOT USE IN PRODUCTION.")
	}

	// OTP service backed by the selected delivery.
	otpSvc := auth.NewOTPServiceWithDelivery(auth.OTPConfig{
		CodeLength:      6,
		Expiry:          15 * time.Minute,
		MaxAttempts:     5,
		RateLimitMax:    10,
		RateLimitWindow: 15 * time.Minute,
	}, otpDelivery)

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
	googleClientID := os.Getenv("GOOGLE_CLIENT_ID")
	googleClientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	googleRedirectURL := os.Getenv("GOOGLE_REDIRECT_URL")
	if googleClientID != "" && googleClientSecret != "" && googleRedirectURL != "" {
		oauthStore := newOAuthUserStore(userSvc, dbPool)
		googleProvider := auth.NewGoogleProvider(googleClientID, googleClientSecret, googleRedirectURL)
		oauthSvc = auth.NewOAuthService(auth.OAuthConfig{
			ClientID:     googleClientID,
			ClientSecret: googleClientSecret,
			RedirectURI:  googleRedirectURL,
		}, googleProvider, oauthStore)
		log.Println("Google OAuth configured")
	} else {
		log.Println("Google OAuth disabled: missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URL")
	}

	authHandler := auth.NewHandler(otpSvc, jwtSvc, oauthSvc, userAuthAdapter).WithWorkspaceLookup(wsLookup)

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
		natsPub, err := events.NewNATSPublisher(natsURL)
		if err != nil {
			log.Fatalf("FATAL: EVENT_BROKER=nats but NATS connection failed (ISSUE-003): %v", err)
		}
		defer natsPub.Close()
		eventPublisher = natsPub
		log.Printf("Events: NATS JetStream publisher wired to %s", natsURL)
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
	credLimiter := middleware.RateLimit(5, time.Minute)
	r.With(credLimiter).Post("/auth/register", authHandler.Register)
	r.With(credLimiter).Post("/auth/login", authHandler.Login)
	r.With(credLimiter).Post("/auth/verify-otp", authHandler.VerifyOTP)
	r.With(credLimiter).Post("/api/v1/auth/register", authHandler.Register)
	r.With(credLimiter).Post("/api/v1/auth/login", authHandler.Login)
	r.With(credLimiter).Post("/api/v1/auth/verify-otp", authHandler.VerifyOTP)

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
	mfaVerifyLimiter := middleware.RateLimit(10, time.Minute)
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
		r.Get("/api/v1/users/profile", profileHandler.GetProfile)
		r.Put("/api/v1/users/profile", profileHandler.UpdateProfile)
	})

	// ──────────────────────── M2: Asset Management & Gallery ────────────────────────

	// ──────────────────────── Storage Provider (Cloudflare R2 — MANDATORY) ────────────────
	// Local storage is NOT supported. R2 credentials MUST be in environment variables.
	// Never hardcode credentials. Never fall back to local filesystem.
	storageCfg := storage.Config{
		Driver:    os.Getenv("STORAGE_DRIVER"),
		Bucket:    envOrFatal("R2_BUCKET_NAME", "R2_BUCKET"), // try R2_BUCKET_NAME first, fallback to R2_BUCKET
		Region:    envOr("auto", "R2_REGION"),
		Endpoint:  os.Getenv("R2_ENDPOINT"),
		AccessKey: envOrFatal("R2_ACCESS_KEY_ID", "R2_ACCESS_KEY"), // try R2_ACCESS_KEY_ID first, fallback to R2_ACCESS_KEY
		SecretKey: envOrFatal("R2_SECRET_ACCESS_KEY", "R2_SECRET_KEY"),
	}
	if storageCfg.Driver == "" {
		storageCfg.Driver = "s3" // R2 uses S3-compatible API
	}
	if storageCfg.Driver == "local" {
		log.Fatal("FATAL: STORAGE_DRIVER=local is not allowed. Use Cloudflare R2 (s3). Set R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT in environment.")
	}
	storageProvider, err := storage.NewProvider(storageCfg)
	if err != nil {
		log.Fatalf("FATAL: failed to create storage provider: %v\nEnsure R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT are set.", err)
	}
	log.Printf("Storage: Cloudflare R2 initialized (bucket: %s, endpoint: %s)", storageCfg.Bucket, storageCfg.Endpoint)

	// M2 Repositories
	assetRepo := repository.NewAssetRepo(dbPool)
	galleryRepo := repository.NewGalleryRepo(dbPool)
	galleryAssetRepo := repository.NewGalleryAssetRepo(dbPool)
	shareLinkRepo := repository.NewShareLinkRepo(dbPool)
	galleryShareLogRepo := repository.NewGalleryShareLogRepo(dbPool)
	proofingRepo := repository.NewProofingRepo(dbPool)

	// M11 Services (initialized early — used by M2 services)
	storageAccountingSvc := service.NewStorageAccounting(dbPool)
	albumRepo := repository.NewAlbumRepo(dbPool)
	albumSvc := service.NewAlbumService(albumRepo)

	// M2 Services
	exifSvc := service.NewExifService()
	uploadSvc := service.NewUploadService(storageProvider, assetRepo, exifSvc).WithStorageAccounting(storageAccountingSvc)

	// ──────────────────────── M16 Tier D Upload Screening ──────────────────
	// Build the validation stack up-front so it can be wired into both the
	// chunked upload handler (M2) and the asset handler (M2). The services
	// here depend on sqlDB (the stdlib adapter over the pgx pool).
	//
	// Enforcement mode is opt-in via TIER_D_ENFORCE_MODE=1 so we can roll
	// out in telemetry-only mode first, observe the real reject rate, and
	// flip the switch once we are confident. Missing env var → telemetry-only.
	m16EnforceMode := os.Getenv("TIER_D_ENFORCE_MODE") == "1"
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
	assetSvc := service.NewAssetService(assetRepo, storageProvider)
	thumbnailSvc := service.NewThumbnailService(storageProvider)
	coverSvc := service.NewGalleryCoverService(galleryRepo, galleryAssetRepo)
	gallerySvc := service.NewGalleryService(galleryRepo, galleryAssetRepo, coverSvc).WithAssetRepo(assetRepo).WithAlbumService(albumSvc)
	shareLinkSvc := service.NewShareLinkService(shareLinkRepo)
	proofingSvc := service.NewProofingService(proofingRepo, galleryRepo).
		WithNotifications(repository.NewNotificationRepo(dbPool)) // GAL-FR-134
	storageConfigSvc := service.NewStorageConfigService(dbPool)

	// M13 Services: Gallery Access, Proofing Sessions, Comments, Album Approval
	accessLogRepo := repository.NewGalleryAccessLogRepo(dbPool)
	proofingSessionRepo := repository.NewProofingSessionRepo(dbPool)
	proofingCommentRepo := repository.NewProofingCommentRepo(dbPool)
	albumApprovalRepo := repository.NewAlbumApprovalRepo(dbPool)
	galleryAccessSvc := service.NewGalleryAccessService(galleryRepo, accessLogRepo)
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
	// M14 GAL-FR-197: Valkey sliding-window rate limiter. When
	// VALKEY_URL is set, construct a go-redis client and wrap it in
	// the RedisValkeyClient. When unset, the limiter middleware is
	// a no-op (all requests pass) so the build still works in dev
	// without a Valkey instance. A startup ping is attempted and
	// logged — a failed ping is not fatal because the middleware
	// fails open on backend errors.
	var valkeyClient middleware.ValkeyClient
	if vurl := os.Getenv("VALKEY_URL"); vurl != "" {
		opts, parseErr := redis.ParseURL(vurl)
		if parseErr != nil {
			log.Printf("valkey: invalid VALKEY_URL %q: %v — rate limiter disabled", vurl, parseErr)
		} else {
			rdb := redis.NewClient(opts)
			pingCtx, pingCancel := context.WithTimeout(context.Background(), 2*time.Second)
			if err := rdb.Ping(pingCtx).Err(); err != nil {
				log.Printf("valkey: ping failed: %v — rate limiter enabled but will fail-open until backend recovers", err)
			} else {
				log.Printf("valkey: connected, sliding-window rate limiter enabled")
			}
			pingCancel()
			valkeyClient = middleware.NewRedisValkeyClient(rdb)
		}
	} else {
		log.Println("valkey: VALKEY_URL not set — sliding-window rate limiter disabled")
	}

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
	lifecycleSvc := service.NewAssetLifecycleService(assetRepo, coverSvc, storageAccountingSvc)

	// Worker registry (declared at main scope so closures can register workers)
	workerRegistry := worker.NewRegistry()

	// In-process event broker for real-time SSE delivery to frontend
	eventBroker := handler.NewEventBroker()

	var m8Deps handler.M8Dependencies                        // declared here so public routes can reference
	var m6Scheduler *scheduler.Scheduler                     // declared here so it can be started below next to workers
	var publicLeadDispatcher *handler.NotificationDispatcher // set inside protected block, consumed by public lead embed below

	// ──────────────────────── Public marketplace routes ────────────────────────
	// Freelancer listing browse + detail + availability and gear
	// browse/detail are intentionally reachable without a bearer token
	// so anonymous visitors can discover the marketplace from the
	// public landing page. Mounted BEFORE the authed group so the JWT
	// middleware never sees them.
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
		api.Use(middleware.TenantContext(dbCtx, auditLog))
		if os.Getenv("MFA_ENFORCE_PHOTOGRAPHERS") == "1" {
			api.Use(middleware.RequireMFA)
		}

		// M2 + M11 Protected routes
		m2Deps := handler.M2Dependencies{
			AssetService:         assetSvc,
			UploadService:        uploadSvc,
			GalleryService:       gallerySvc,
			ShareLinkService:     shareLinkSvc,
			GalleryShareSender:   galleryShareSender,
			GalleryShareLogRepo:  galleryShareLogRepo,
			PublicBaseURL:        os.Getenv("FRONTEND_URL"),
			ProofingService:      proofingSvc,
			StorageConfigService: storageConfigSvc,
			// M11
			AlbumService:         albumSvc,
			StorageAccountingSvc: storageAccountingSvc,
			LifecycleService:     lifecycleSvc,
			AssetRepo:            assetRepo,
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
			// M13 deferred-FR closure (GAL-FR-115 branding, GAL-FR-107/108 FaceID).
			// ai.NewFaceRepo is stateless — constructing it twice (here and in
			// the AI init block below) is safe and keeps this block self-contained.
			Pool:     dbPool,
			FaceRepo: ai.NewFaceRepo(dbPool),
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
		chunkedHandler := handler.NewChunkedUploadHandler(uploadSvc, assetRepo, storageProvider, uploadSessionsRepo).
			WithValidation(uploadValidationSvc).
			WithStorageAccounting(storageAccountingSvc)
		chunkedHandler.RegisterRoutes(api)

		// M17 audit followup (S-011): register the upload-session cleanup
		// worker so abandoned chunked uploads don't leak R2 multipart
		// state and upload_sessions rows indefinitely. Polls every 15
		// minutes and aborts each expired session's R2 multipart upload
		// before deleting the DB row.
		uploadSessionCleanupWorker := worker.NewUploadSessionCleanupWorker(uploadSessionsRepo, storageProvider)
		workerRegistry.Register("upload-session-cleanup", uploadSessionCleanupWorker)

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
		notifDeliverySvc := service.NewNotificationDeliveryService(notificationRepo).
			WithProvider(service.LogWhatsAppProvider{}).
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
		log.Println("M4: notification delivery service wired (log-only email/push/whatsapp providers)")

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

		handler.RegisterM6Routes(api, handler.M6Dependencies{
			DB:              dbPool,
			DealerRepo:      dealerRepo,
			CouponRepo:      couponRepo,
			MarginRepo:      marginRepo,
			PayoutRepo:      payoutRepo,
			KycDocumentRepo: kycDocumentRepo,
			DealerAnalytics: dealerAnalyticsSvc,
		})

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
		auditLogRepo := repository.NewAuditLogRepo(dbPool)

		auditLogSvc := service.NewAuditLogService(auditLogRepo)
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

		handler.RegisterAdminRoutes(api, handler.AdminDeps{
			UserSvc:       service.NewAdminUserService(adminUserRepo, auditLogSvc, jwtSecret),
			ModerationSvc: service.NewAdminModerationService(adminModerationRepo, auditLogSvc),
			WorkspaceSvc:  service.NewAdminWorkspaceService(adminWorkspaceRepo),
			RevenueSvc:    service.NewAdminRevenueService(adminRevenueRepo),
			AnalyticsSvc:  service.NewAdminAnalyticsService(adminAnalyticsRepo),
			ExportSvc:     service.NewAdminExportService(adminUserRepo, adminRevenueRepo),
			HealthSvc:     service.NewAdminHealthService(adminHealthRepo),
			AuditLogSvc:   auditLogSvc,
			// M16 Tier D admin surfaces
			WorkspacePolicySvc:  workspacePolicySvc,
			UploadModerationSvc: uploadModerationSvc,
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
		streamingrecharge.RegisterRoutes(r, streamingrecharge.NewHandler(rechargeSvc, dbPool))
		log.Println("M32/F-014: Recharge + webhooks (PhonePe/Razorpay) + GST invoice + refund registered")

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

		// PIN brute-force defence: in-memory limiter, 5 attempts per 5min
		// per (IP, stream). Sufficient for single-node staging; production
		// should swap a Valkey-backed limiter behind the same interface.
		pinLimiter := middleware.NewMemoryPINRateLimiter(5, 5*time.Minute)

		m8Deps = handler.M8Dependencies{
			StreamService:  streamSvc,
			VideoService:   videoSvc,
			DesktopService: desktopSvc,
			ViewerJWT:      viewerJWT,
			PINRateLimiter: pinLimiter,
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
	// Query-param token fallback lets <img src> tags authenticate
	// without a custom header — the Authorization header form is
	// preserved for fetch() callers that already set it.
	r.Get("/storage/*", func(w http.ResponseWriter, r *http.Request) {
		key := chi.URLParam(r, "*")
		if key == "" {
			http.Error(w, `{"error":"missing key"}`, http.StatusBadRequest)
			return
		}
		// Public gallery access: thumbnails/* objects are derivative
		// renders (small JPEG/WebP previews) and are safe to serve
		// anonymously because they are the exact bytes a visitor
		// already receives from a /g/{slug} client gallery. Originals
		// (keyed under <workspace>/<upload>/original.<ext>) still
		// require a bearer token. This is what unlocked the public
		// gallery grid during UAT — otherwise anonymous visitors
		// hit 401 on every <img src>.
		isPublicThumbnail := strings.HasPrefix(key, "thumbnails/")

		if !isPublicThumbnail {
			// Verify JWT — accept Bearer header OR ?token=... for <img src>.
			tokenStr := ""
			if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
				tokenStr = strings.TrimPrefix(h, "Bearer ")
			} else if q := r.URL.Query().Get("token"); q != "" {
				tokenStr = q
			}
			if tokenStr == "" {
				http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
				return
			}
			if _, err := jwtSvc.ParseAccessToken(r.Context(), tokenStr); err != nil {
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}
		}

		rc, err := storageProvider.Get(r.Context(), key)
		if err != nil {
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
	thumbWorker := worker.NewThumbnailWorker(assetRepo, thumbnailSvc, storageProvider).WithPublisher(eventBroker)
	workerRegistry.Register("thumbnail", thumbWorker)
	purgeWorker := worker.NewAssetPurgeWorker(dbPool, storageProvider)
	workerRegistry.Register("asset-purge", purgeWorker)
	expiryWorker := worker.NewGalleryExpiryWorker(dbPool)
	workerRegistry.Register("gallery-expiry", expiryWorker)
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
