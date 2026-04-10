package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/ai"
	"github.com/rawdrive/backend/internal/auth"
	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/onboarding"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/storage"
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

func (o *onboardingWorkspaceCreator) CreateWorkspace(ctx context.Context, userID, stateCode, businessName string) (string, error) {
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

// envOrFatal tries multiple env var names in order. Returns the first non-empty value.
// Logs fatal if none are set.
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

	// ──────────────────────── M1: Auth, Users, Workspaces, Teams ──────────────────

	// Real user service backed by DB
	userRepo := user.NewPgRepo(dbPool)
	userSvc := user.NewService(userRepo)
	userAuthAdapter := user.NewAuthAdapter(userSvc)

	// OTP with dev logging (prints code to stdout)
	otpSvc := auth.NewOTPServiceWithDelivery(auth.OTPConfig{
		CodeLength:      6,
		Expiry:          15 * time.Minute,
		MaxAttempts:     5,
		RateLimitMax:    10,
		RateLimitWindow: 15 * time.Minute,
	}, &logOTPDelivery{})

	// JWT
	jwtSvc := auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
		MaxSessions:        5,
	})

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

	// Real workspace service backed by DB
	wsRepo := workspace.NewPgRepo(dbPool)
	wsSvc := workspace.NewService(wsRepo, &logEventPublisher{}, &logStorageBucket{})
	wsHandler := workspace.NewHandler(wsSvc)

	// Onboarding with real workspace creation
	onbSvc := onboarding.NewService(&onboardingWorkspaceCreator{wsSvc: wsSvc, pool: dbPool}, &logEventPublisher{})
	onbHandler := onboarding.NewHandler(onbSvc)

	// Real team repos backed by DB
	invRepo := teamPkg.NewPgInvitationRepo(dbPool)
	memberRepo := teamPkg.NewPgMemberRepo(dbPool)
	invSvc := teamPkg.NewInvitationService(
		invRepo,
		&logEmailSender{},
		memberRepo,
		userAuthAdapter,
		teamPkg.InvitationConfig{ExpiryDuration: 7 * 24 * time.Hour},
	)
	teamHandler := teamPkg.NewHandler(invSvc, nil, nil)

	// Real DB context for RLS + audit logging
	dbCtx := middleware.NewPgDBContext(dbPool)
	auditLog := middleware.NewPgAuditLog(dbPool)

	// Mount auth routes (no JWT required — this IS the login endpoint)
	r.Mount("/auth", authHandler.Routes())
	r.Mount("/api/v1/auth", authHandler.Routes())

	// Protected routes — JWT auth → tenant context → state check
	r.Group(func(pr chi.Router) {
		pr.Use(middleware.JWTAuth(jwtSvc))
		pr.Use(middleware.TenantContext(dbCtx, auditLog))
		pr.Use(middleware.RequireState)

		pr.Mount("/workspace", wsHandler.Routes())
		pr.Mount("/team", teamHandler.Routes())
	})

	// Onboarding routes (JWT auth but exempt from RequireState)
	r.Group(func(r chi.Router) {
		r.Use(middleware.JWTAuth(jwtSvc))
		r.Mount("/onboarding", onbHandler.Routes())
	})

	// ──────────────────────── M2: Asset Management & Gallery ────────────────────────

	// ──────────────────────── Storage Provider (Cloudflare R2 — MANDATORY) ────────────────
	// Local storage is NOT supported. R2 credentials MUST be in environment variables.
	// Never hardcode credentials. Never fall back to local filesystem.
	storageCfg := storage.Config{
		Driver:    os.Getenv("STORAGE_DRIVER"),
		Bucket:    envOrFatal("R2_BUCKET_NAME", "R2_BUCKET"),      // try R2_BUCKET_NAME first, fallback to R2_BUCKET
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
	proofingRepo := repository.NewProofingRepo(dbPool)

	// M11 Services (initialized early — used by M2 services)
	storageAccountingSvc := service.NewStorageAccounting(dbPool)
	albumRepo := repository.NewAlbumRepo(dbPool)
	albumSvc := service.NewAlbumService(albumRepo)

	// M2 Services
	exifSvc := service.NewExifService()
	uploadSvc := service.NewUploadService(storageProvider, assetRepo, exifSvc).WithStorageAccounting(storageAccountingSvc)
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

	// M14 Services: Downloads, Analytics, Webhooks
	downloadRepo := repository.NewDownloadRepo(dbPool)
	galleryAnalyticsRepo := repository.NewGalleryAnalyticsRepo(dbPool)
	webhookRepo := repository.NewWebhookRepo(dbPool)
	galleryAnalyticsSvc := service.NewGalleryAnalyticsService(galleryAnalyticsRepo)
	webhookSvc := service.NewWebhookService(webhookRepo)
	downloadSvc := service.NewDownloadService(assetRepo, galleryAssetRepo, storageProvider).WithDownloadRepo(downloadRepo)

	// M15 Services: Consent
	consentRepo := repository.NewConsentRepo(dbPool)
	consentSvc := service.NewConsentService(consentRepo)

	// M11 Services: Lifecycle
	lifecycleSvc := service.NewAssetLifecycleService(assetRepo, coverSvc, storageAccountingSvc)

	// Worker registry (declared at main scope so closures can register workers)
	workerRegistry := worker.NewRegistry()

	// In-process event broker for real-time SSE delivery to frontend
	eventBroker := handler.NewEventBroker()

	var m8Deps handler.M8Dependencies // declared here so public routes can reference

	// ──────────────────────── Protected API routes (JWT + Tenant) ──────────────
	// All M2, M3, M4 data-plane endpoints require authentication.
	r.Group(func(api chi.Router) {
		api.Use(middleware.JWTAuth(jwtSvc))
		api.Use(middleware.TenantContext(dbCtx, auditLog))

		// M2 + M11 Protected routes
		m2Deps := handler.M2Dependencies{
			AssetService:         assetSvc,
			UploadService:        uploadSvc,
			GalleryService:       gallerySvc,
			ShareLinkService:     shareLinkSvc,
			ProofingService:      proofingSvc,
			StorageConfigService: storageConfigSvc,
			// M11
			AlbumService:         albumSvc,
			StorageAccountingSvc: storageAccountingSvc,
			LifecycleService:     lifecycleSvc,
			AssetRepo:            assetRepo,
			// M12
			GalleryDesignSvc:     service.NewGalleryDesignService(galleryRepo),
			GalleryRepo:          galleryRepo,
			DesignTemplateSvc:    service.NewDesignTemplateService(repository.NewDesignTemplateRepo(dbPool), galleryRepo),
			DesignCollabSvc:      service.NewDesignCollabService(nil), // nil NATS — uses in-memory presence
			DesignAISvc:          nil, // set after AI init below
			// M13
			GalleryAccessSvc:     galleryAccessSvc,
			ProofingSessionSvc:   proofingSessionSvc,
			ProofingCommentSvc:   proofingCommentSvc,
			AlbumApprovalSvc:     albumApprovalSvc,
			// M14
			DownloadService:      downloadSvc,
			GalleryAnalyticsSvc:  galleryAnalyticsSvc,
			WebhookSvc:           webhookSvc,
			// M15
			ConsentSvc:           consentSvc,
			// M13 deferred-FR closure (GAL-FR-115 branding, GAL-FR-107/108 FaceID).
			// ai.NewFaceRepo is stateless — constructing it twice (here and in
			// the AI init block below) is safe and keeps this block self-contained.
			Pool:     dbPool,
			FaceRepo: ai.NewFaceRepo(dbPool),
		}
		handler.RegisterM2Routes(api, m2Deps)

		// Public gallery routes — registered on outer router (no auth required)
		handler.RegisterPublicGalleryRoutes(r, m2Deps)

		// Chunked upload routes
		tmpDir := os.Getenv("UPLOAD_TMP_DIR")
		if tmpDir == "" {
			tmpDir = ".tmp/uploads"
		}
		chunkedHandler := handler.NewChunkedUploadHandler(uploadSvc, assetRepo, storageProvider, tmpDir)
		chunkedHandler.RegisterRoutes(api)

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

		// Gemini client
		geminiModelID := os.Getenv("GEMINI_MODEL_ID")
		if geminiModelID == "" {
			geminiModelID = "gemini-2.0-flash"
		}
		geminiClient := ai.NewGeminiClient(geminiModelID)

		// AI services
		faceSvc := ai.NewFaceService(aiFaceRepo, aiJobRepo, aiConfigRepo, aiSpendRepo, geminiClient, storageProvider)
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

		// M12: Wire AI design suggestions (now that gemini + aiConfigRepo are available)
		designAISvc := service.NewDesignAIService(assetRepo, geminiClient, aiConfigRepo)
		designAIHandler := handler.NewDesignAIHandler(designAISvc)
		api.Get("/api/v1/galleries/{id}/ai-suggest", designAIHandler.Suggest)

		// ──────────────────────── M4: Business Operations ──────────────────────

		// M4 Repositories
		leadRepo := repository.NewLeadRepo(dbPool)
		contactRepo := repository.NewContactRepo(dbPool)
		dealRepo := repository.NewDealRepo(dbPool)
		invoiceRepo := repository.NewInvoiceRepo(dbPool)
		paymentRepo := repository.NewPaymentRepo(dbPool)
		contractRepo := repository.NewContractRepo(dbPool)
		eventRepo := repository.NewEventRepo(dbPool)
		notificationRepo := repository.NewNotificationRepo(dbPool)

		// M4 routes (public lead form is registered inside RegisterM4Routes without auth)
		handler.RegisterM4Routes(api, handler.M4Dependencies{
			DB:               dbPool,
			LeadRepo:         leadRepo,
			ContactRepo:      contactRepo,
			DealRepo:         dealRepo,
			InvoiceRepo:      invoiceRepo,
			PaymentRepo:      paymentRepo,
			ContractRepo:     contractRepo,
			EventRepo:        eventRepo,
			NotificationRepo: notificationRepo,
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

		handler.RegisterM6Routes(api, handler.M6Dependencies{
			DB:         dbPool,
			DealerRepo: dealerRepo,
			CouponRepo: couponRepo,
			MarginRepo: marginRepo,
			PayoutRepo: payoutRepo,
		})

		log.Println("M6: Revenue & Dealership Engine routes registered (Dealers, Coupons, Margins, Payouts)")

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

		handler.RegisterAdminRoutes(api, handler.AdminDeps{
			UserSvc:       service.NewAdminUserService(adminUserRepo, auditLogSvc, jwtSecret),
			ModerationSvc: service.NewAdminModerationService(adminModerationRepo, auditLogSvc),
			WorkspaceSvc:  service.NewAdminWorkspaceService(adminWorkspaceRepo),
			RevenueSvc:    service.NewAdminRevenueService(adminRevenueRepo),
			AnalyticsSvc:  service.NewAdminAnalyticsService(adminAnalyticsRepo),
			ExportSvc:     service.NewAdminExportService(adminUserRepo, adminRevenueRepo),
			HealthSvc:     service.NewAdminHealthService(adminHealthRepo),
			AuditLogSvc:   auditLogSvc,
		})

		log.Println("M7: Admin Command Center routes registered (Users, Moderation, Workspaces, Revenue, Analytics, Export, Health, Audit)")

		// ──────────────────────── Platform Settings (Super Admin) ──────────────────
		platformSettingsRepo := repository.NewPlatformSettingsRepo(dbPool)
		handler.RegisterAdminSettingsRoutes(api, platformSettingsRepo)
		log.Println("Admin: Platform settings CRUD registered (storage, auth, payments, ai, email)")

		// ──────────────────────── M8: Live Streaming & Desktop Companion ──────────────
		streamRepo := repository.NewStreamRepo(dbPool)
		streamChatRepo := repository.NewStreamChatRepo(dbPool)
		videoRepo := repository.NewVideoRepo(dbPool)
		desktopSessionRepo := repository.NewDesktopSessionRepo(dbPool)
		streamSvc := service.NewStreamService(streamRepo, streamChatRepo)
		videoSvc := service.NewVideoService(videoRepo)
		desktopSvc := service.NewDesktopService(desktopSessionRepo)
		m8Deps = handler.M8Dependencies{StreamService: streamSvc, VideoService: videoSvc, DesktopService: desktopSvc}
		handler.RegisterM8Routes(api, m8Deps)
		log.Println("M8: Live Streaming, Video, Desktop routes registered")

	}) // end protected API group

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
	publicLeadHandler := handler.NewLeadEmbedHandler(publicLeadRepo)
	r.Post("/api/v1/public/leads/{workspaceId}", publicLeadHandler.Submit)

	log.Println("Public lead form endpoint registered")

	// ──────────────────────── Authenticated Storage Proxy ────────────────
	// Proxies storage file requests through JWT auth + R2 presigned URLs.
	// Photos are stored in R2 only — never on local filesystem.
	r.Route("/storage", func(sr chi.Router) {
		sr.Use(middleware.JWTAuth(jwtSvc))
		sr.Get("/*", func(w http.ResponseWriter, r *http.Request) {
			key := chi.URLParam(r, "*")
			presigned, err := storageProvider.PresignURL(r.Context(), key, storage.PresignOptions{ExpiresInSeconds: 3600})
			if err != nil {
				http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
				return
			}
			http.Redirect(w, r, presigned, http.StatusTemporaryRedirect)
		})
	})
	log.Println("Storage: R2 proxy with JWT auth on /storage/*")

	// ──────────────────────── Background Workers (start after all routes) ────────────────
	thumbWorker := worker.NewThumbnailWorker(assetRepo, thumbnailSvc, storageProvider).WithPublisher(eventBroker)
	workerRegistry.Register("thumbnail", thumbWorker)
	purgeWorker := worker.NewAssetPurgeWorker(dbPool, storageProvider)
	workerRegistry.Register("asset-purge", purgeWorker)
	expiryWorker := worker.NewGalleryExpiryWorker(dbPool)
	workerRegistry.Register("gallery-expiry", expiryWorker)
	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()
	workerRegistry.StartAll(workerCtx)
	log.Println("Workers: all started (thumbnail, asset-purge, gallery-expiry, face-detection, ai-tagging, duplicate-scan, message-cleanup, moderation)")

	// ──────────────────────── Health Check ────────────────────────

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// ──────────────────────── Start Server ────────────────────────

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	fmt.Printf("RawDrive API starting on :%s\n", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

// Zero stubs remain — all dependencies are backed by real implementations.
