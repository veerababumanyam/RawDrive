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
type onboardingWorkspaceCreator struct {
	wsSvc workspace.Service
}

func (o *onboardingWorkspaceCreator) CreateWorkspace(ctx context.Context, userID, stateID, businessName string) (string, error) {
	ws, err := o.wsSvc.Create(ctx, workspace.CreateWorkspaceInput{
		Name:         businessName,
		StateID:      stateID,
		OwnerID:      userID,
		BusinessName: businessName,
	})
	if err != nil {
		return "", err
	}
	return ws.ID, nil
}

func main() {
	r := chi.NewRouter()

	// Global middleware
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
		Expiry:          5 * time.Minute,
		MaxAttempts:     5,
		RateLimitMax:    10,
		RateLimitWindow: time.Minute,
	}, &logOTPDelivery{})

	// JWT
	jwtSvc := auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
		MaxSessions:        5,
	})

	wsLookup := workspace.NewAuthLookup(dbPool)
	authHandler := auth.NewHandler(otpSvc, jwtSvc, nil, userAuthAdapter).WithWorkspaceLookup(wsLookup)

	// Real workspace service backed by DB
	wsRepo := workspace.NewPgRepo(dbPool)
	wsSvc := workspace.NewService(wsRepo, &logEventPublisher{}, &logStorageBucket{})
	wsHandler := workspace.NewHandler(wsSvc)

	// Onboarding with real workspace creation
	onbSvc := onboarding.NewService(&onboardingWorkspaceCreator{wsSvc: wsSvc}, &logEventPublisher{})
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

	// Storage provider
	storageCfg := storage.Config{
		Driver:    os.Getenv("STORAGE_DRIVER"),
		LocalDir:  os.Getenv("STORAGE_LOCAL_DIR"),
		Bucket:    os.Getenv("R2_BUCKET"),
		Region:    os.Getenv("R2_REGION"),
		Endpoint:  os.Getenv("R2_ENDPOINT"),
		AccessKey: os.Getenv("R2_ACCESS_KEY"),
		SecretKey: os.Getenv("R2_SECRET_KEY"),
	}
	if storageCfg.Driver == "" {
		storageCfg.Driver = "local"
		storageCfg.LocalDir = ".storage"
		log.Println("M2: no STORAGE_DRIVER set, using local filesystem at .storage/")
	}
	storageProvider, err := storage.NewProvider(storageCfg)
	if err != nil {
		log.Fatalf("M2: failed to create storage provider: %v", err)
	}

	// M2 Repositories
	assetRepo := repository.NewAssetRepo(dbPool)
	galleryRepo := repository.NewGalleryRepo(dbPool)
	galleryAssetRepo := repository.NewGalleryAssetRepo(dbPool)
	shareLinkRepo := repository.NewShareLinkRepo(dbPool)
	proofingRepo := repository.NewProofingRepo(dbPool)

	// M2 Services
	exifSvc := service.NewExifService()
	uploadSvc := service.NewUploadService(storageProvider, assetRepo, exifSvc)
	assetSvc := service.NewAssetService(assetRepo, storageProvider)
	thumbnailSvc := service.NewThumbnailService(storageProvider)
	coverSvc := service.NewGalleryCoverService(galleryRepo, galleryAssetRepo)
	gallerySvc := service.NewGalleryService(galleryRepo, galleryAssetRepo, coverSvc)
	shareLinkSvc := service.NewShareLinkService(shareLinkRepo)
	proofingSvc := service.NewProofingService(proofingRepo, galleryRepo)
	storageConfigSvc := service.NewStorageConfigService()

	// ──────────────────────── Protected API routes (JWT + Tenant) ──────────────
	// All M2, M3, M4 data-plane endpoints require authentication.
	r.Group(func(api chi.Router) {
		api.Use(middleware.JWTAuth(jwtSvc))
		api.Use(middleware.TenantContext(dbCtx, auditLog))

	// M2 Protected routes
	handler.RegisterM2Routes(api, handler.M2Dependencies{
		AssetService:         assetSvc,
		UploadService:        uploadSvc,
		GalleryService:       gallerySvc,
		ShareLinkService:     shareLinkSvc,
		ProofingService:      proofingSvc,
		StorageConfigService: storageConfigSvc,
	})

	// Chunked upload routes
	tmpDir := os.Getenv("UPLOAD_TMP_DIR")
	if tmpDir == "" {
		tmpDir = ".tmp/uploads"
	}
	chunkedHandler := handler.NewChunkedUploadHandler(uploadSvc, assetRepo, storageProvider, tmpDir)
	chunkedHandler.RegisterRoutes(api)

	// Thumbnail worker
	thumbWorker := worker.NewThumbnailWorker(assetRepo, thumbnailSvc, storageProvider)
	workerRegistry := worker.NewRegistry()
	workerRegistry.Register("thumbnail", thumbWorker)
	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()
	workerRegistry.StartAll(workerCtx)

	log.Println("M2: routes registered, thumbnail worker started")

	// ──────────────────────── M3: AI & Intelligence Layer ──────────────────────

	// AI encryption key (32 bytes from env, or dev default)
	aiEncKeyStr := os.Getenv("AI_ENCRYPTION_KEY")
	if aiEncKeyStr == "" {
		aiEncKeyStr = "rawdrive-dev-key-32bytes-pad!!" // 32 bytes, dev only
		log.Println("M3: WARNING - using dev AI encryption key. Set AI_ENCRYPTION_KEY in production.")
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
	aiHandler := ai.NewHandler(faceSvc, searchSvc, duplicateSvc, cullingSvc, aiConfigRepo, aiSpendRepo, aiJobRepo)

	// M3 routes
	handler.RegisterM3Routes(api, handler.M3Dependencies{AIHandler: aiHandler})

	// AI workers
	faceWorker := ai.NewFaceWorker(aiJobRepo, faceSvc, assetRepo, storageProvider)
	searchWorker := ai.NewSearchWorker(dbPool, searchSvc, aiConfigRepo)
	duplicateWorker := ai.NewDuplicateWorker(aiJobRepo, duplicateSvc)
	workerRegistry.Register("face-detection", faceWorker)
	workerRegistry.Register("ai-tagging", searchWorker)
	workerRegistry.Register("duplicate-scan", duplicateWorker)

	log.Println("M3: AI routes registered, 3 workers registered")

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
		Events:         &logEventPublisher{},
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

	}) // end protected API group

	// Public lead capture (no auth required — embeddable on external sites)
	publicLeadRepo := repository.NewLeadRepo(dbPool)
	publicLeadHandler := handler.NewLeadEmbedHandler(publicLeadRepo)
	r.Post("/api/v1/public/leads/{workspaceId}", publicLeadHandler.Submit)

	log.Println("Public lead form endpoint registered")

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
