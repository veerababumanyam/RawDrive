package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rawdrive/backend/internal/ai"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// RegisterM2Routes registers all M2 (Asset Management & Gallery) and M11 (Processing, Storage, Organization) routes.
// Returns the GalleryHandler so callers can wire AI deps post-hoc after AI init.
func RegisterM2Routes(r chi.Router, deps M2Dependencies) *GalleryHandler {
	// M16 E47-S5: chain the Tier D validation service onto the asset handler
	// when it is wired (nil-safe — pre-M16 callers continue to work).
	assetHandler := NewAssetHandler(deps.AssetService, deps.UploadService).
		WithValidation(deps.UploadValidationSvc)
	galleryHandler := NewGalleryHandler(deps.GalleryService)
	// M21: wire face scan deps when available
	if deps.FaceSvc != nil && deps.AssetService != nil && deps.JobRepo != nil {
		galleryHandler.WithAIDeps(deps.FaceSvc, deps.AssetService, deps.JobRepo)
	}
	shareHandler := NewShareLinkHandler(deps.ShareLinkService)
	proofingHandler := NewProofingHandler(deps.ProofingService)
	storageConfigHandler := NewStorageConfigHandler(deps.StorageConfigService)

	// M11 handlers
	var albumHandler *AlbumHandler
	if deps.AlbumService != nil {
		albumHandler = NewAlbumHandler(deps.AlbumService)
	}
	var storageAnalyticsHandler *StorageAnalyticsHandler
	if deps.StorageAccountingSvc != nil {
		storageAnalyticsHandler = NewStorageAnalyticsHandler(deps.StorageAccountingSvc)
	}
	var processingStatusHandler *ProcessingStatusHandler
	if deps.AssetRepo != nil {
		processingStatusHandler = NewProcessingStatusHandler(deps.AssetRepo)
	}
	var lifecycleHandler *LifecycleHandler
	if deps.LifecycleService != nil {
		lifecycleHandler = NewLifecycleHandler(deps.LifecycleService)
	}
	var bulkHandler *BulkAssetHandler
	if deps.AssetRepo != nil {
		bulkHandler = NewBulkAssetHandler(deps.AssetRepo)
	}

	// Protected asset routes
	r.Route("/api/v1/assets", func(r chi.Router) {
		r.Get("/", assetHandler.List)
		r.Post("/", assetHandler.Upload)

		// M11: Static routes BEFORE /{id} wildcard to avoid chi route conflicts
		if processingStatusHandler != nil {
			r.Get("/processing-stream", processingStatusHandler.SSEStream)
		}
		if bulkHandler != nil {
			r.Post("/bulk", bulkHandler.BulkAction)
		}

		// Parametric routes
		r.Get("/{id}", assetHandler.GetByID)
		r.Get("/{id}/download", assetHandler.Download)
		r.Delete("/{id}", assetHandler.SoftDelete)
		if processingStatusHandler != nil {
			r.Get("/{id}/processing-status", processingStatusHandler.GetStatus)
		}
		if lifecycleHandler != nil {
			r.Post("/{id}/lifecycle", lifecycleHandler.Transition)
		}
	})

	// Protected gallery routes
	r.Route("/api/v1/galleries", func(r chi.Router) {
		r.Get("/", galleryHandler.List)
		r.Post("/", galleryHandler.Create)
		r.Get("/{id}", galleryHandler.GetByID)
		r.Put("/{id}", galleryHandler.Update)
		r.Delete("/{id}", galleryHandler.SoftDelete)
		r.Post("/{id}/duplicate", galleryHandler.DuplicateGallery)
		r.Post("/{id}/assets", galleryHandler.AddAsset)
		r.Delete("/{id}/assets/{assetId}", galleryHandler.RemoveAsset)
		r.Get("/{id}/assets", galleryHandler.ListAssets)
		r.Patch("/{id}/assets/reorder", galleryHandler.ReorderAssets)
		r.Get("/{id}/assets/timeline", galleryHandler.Timeline)

		// M3 E8-S1 #6: privacy opt-out for face detection pipeline
		r.Patch("/{id}/face-detection", galleryHandler.SetFaceDetection)

		// M21: per-gallery face scan trigger and status (nil-safe — handlers
		// return 503 when face service is unavailable, so routes are always
		// registered). scan-status works with just JobRepo; scan-faces needs
		// FaceSvc which may be wired post-hoc after AI init.
		r.Post("/{id}/ai/scan-faces", galleryHandler.TriggerFaceScan)
		r.Get("/{id}/ai/scan-status", galleryHandler.GetFaceScanStatus)

		// M11: Albums (sub-galleries)
		if albumHandler != nil {
			r.Get("/{id}/albums", albumHandler.List)
			r.Post("/{id}/albums", albumHandler.Create)
		}

		// M11: Processing retry
		if processingStatusHandler != nil {
			r.Post("/{galleryId}/assets/retry-failed", processingStatusHandler.BulkRetry)
		}

		// M12: Gallery Design Studio
		if deps.GalleryDesignSvc != nil {
			designHandler := NewGalleryDesignHandler(deps.GalleryDesignSvc)
			r.Get("/{id}/design", designHandler.GetDesign)
			r.Put("/{id}/design", designHandler.UpdateDesign)
		}
		if deps.GalleryRepo != nil {
			coverHandler := NewGalleryCoverHandler(deps.GalleryRepo)
			r.Put("/{id}/cover", coverHandler.UpdateCover)
		}
		if deps.DesignTemplateSvc != nil {
			templateHandler := NewDesignTemplateHandler(deps.DesignTemplateSvc)
			r.Post("/{id}/apply-template", templateHandler.ApplyTemplate)
		}
		if deps.DesignCollabSvc != nil {
			collabHandler := NewDesignCollabHandler(deps.DesignCollabSvc)
			r.Post("/{id}/collab/join", collabHandler.JoinSession)
			r.Post("/{id}/collab/leave", collabHandler.LeaveSession)
			r.Post("/{id}/collab/lock", collabHandler.AcquireLock)
			r.Delete("/{id}/collab/lock/{sectionId}", collabHandler.ReleaseLock)
			r.Get("/{id}/collab/stream", collabHandler.SSEStream)
		}
		if deps.DesignAISvc != nil {
			aiHandler := NewDesignAIHandler(deps.DesignAISvc)
			r.Get("/{id}/ai-suggest", aiHandler.Suggest)
		}

		// Share links
		r.Post("/{id}/share", shareHandler.Create)
		r.Get("/{id}/share", shareHandler.ListByGallery)
		r.Delete("/{id}/share/{linkId}", shareHandler.Revoke)

		// Proofing
		r.Get("/{id}/proofing", proofingHandler.ListByGallery)
		r.Patch("/{id}/proofing/{selectionId}", proofingHandler.UpdateStatus)
		// GAL-FR-130: CSV export of proofing selections
		r.Get("/{id}/proofing/export.csv", proofingHandler.ExportCSV)

		// M13: Gallery Access Control
		if deps.GalleryAccessSvc != nil {
			accessHandler := NewGalleryAccessHandler(deps.GalleryAccessSvc)
			r.Post("/{id}/password", accessHandler.SetPassword)
			r.Patch("/{id}/access-mode", accessHandler.SetAccessMode)
			r.Post("/{id}/view-as-client", accessHandler.ViewAsClient)
			r.Get("/{id}/access-logs", accessHandler.GetAccessLogs)
			r.Patch("/{id}/proofing/deadline", accessHandler.SetProofingDeadline)
		}

		// M13: Enhanced Proofing (sessions, comments, album approval)
		if deps.ProofingSessionSvc != nil {
			psHandler := NewProofingSessionHandler(deps.ProofingSessionSvc, deps.ProofingCommentSvc, deps.AlbumApprovalSvc)
			r.Post("/{id}/proofing/sessions", psHandler.CreateSession)
			r.Get("/{id}/proofing/sessions", psHandler.ListSessions)
			r.Patch("/{id}/proofing/sessions/{sessionId}", psHandler.UpdateSession)
			r.Delete("/{id}/proofing/sessions/{sessionId}", psHandler.DeleteSession)
			r.Patch("/{id}/proofing/selections/{selId}/rating", psHandler.SetStarRating)
			r.Patch("/{id}/proofing/selections/{selId}/label", psHandler.SetColorLabel)
			r.Post("/{id}/proofing/comments", psHandler.CreateComment)
			r.Get("/{id}/proofing/comments", psHandler.GetComments)
			r.Post("/{id}/proofing/album-approval", psHandler.SubmitAlbumApproval)
			r.Get("/{id}/proofing/album-approval", psHandler.ListAlbumApprovals)
		}
	})

	// M11: Album detail routes
	if albumHandler != nil {
		r.Route("/api/v1/albums", func(r chi.Router) {
			r.Get("/{id}", albumHandler.GetByID)
			r.Delete("/{id}", albumHandler.Delete)
			r.Get("/{id}/breadcrumb", albumHandler.Breadcrumb)
			r.Get("/{id}/assets", albumHandler.ListAssets)
			r.Post("/{id}/assets", albumHandler.AddAssets)
		})
	}

	// M11: Storage analytics and usage
	if storageAnalyticsHandler != nil {
		r.Route("/api/v1/storage", func(r chi.Router) {
			r.Get("/analytics", storageAnalyticsHandler.GetAnalytics)
			r.Get("/usage", storageAnalyticsHandler.GetUsage)
		})
	}

	// M12: Design Templates (top-level, not nested under galleries/{id})
	if deps.DesignTemplateSvc != nil {
		templateHandler := NewDesignTemplateHandler(deps.DesignTemplateSvc)
		r.Route("/api/v1/design-templates", func(r chi.Router) {
			r.Post("/", templateHandler.CreateTemplate)
			r.Get("/", templateHandler.ListTemplates)
			r.Get("/{id}", templateHandler.GetTemplate)
			r.Put("/{id}", templateHandler.UpdateTemplate)
			r.Delete("/{id}", templateHandler.DeleteTemplate)
			r.Post("/{id}/restore", templateHandler.RestoreTemplate)
		})
	}

	// Storage config (workspace settings)
	r.Route("/api/v1/workspaces/{workspaceId}/storage-config", func(r chi.Router) {
		r.Post("/test", storageConfigHandler.TestConnection)
	})
	// F-011 (audit 2026-04-10): authoritative plan tier lookup for the
	// settings UI. Uses "current" as the literal path segment because the
	// handler reads workspace_id from JWT claims (so clients can't spoof).
	r.Get("/api/v1/workspaces/current/plan", storageConfigHandler.GetCurrentPlan)

	// Workspace business profile — studio address, GSTIN, bank details,
	// invoice terms + footer, signature name. Used by the Settings →
	// Business Profile page so the invoice PDF renderer has real studio
	// branding to lay out. Uses "current" literal + JWT workspace id
	// (same pattern as /plan above).
	if deps.Pool != nil {
		profileHandler := &WorkspaceProfileHandler{DB: deps.Pool}
		r.Get("/api/v1/workspaces/current/profile", profileHandler.GetProfile)
		r.Put("/api/v1/workspaces/current/profile", profileHandler.UpdateProfile)
	}

	// M14: Download routes
	if deps.DownloadService != nil {
		dlHandler := NewDownloadHandler(deps.DownloadService)
		r.Route("/api/v1/galleries/{id}/downloads", func(r chi.Router) {
			r.Post("/", dlHandler.CreateJob)
			r.Get("/", dlHandler.ListJobs)
			r.Get("/{jobId}", dlHandler.GetJob)
		})
		r.Get("/api/v1/galleries/{id}/download-zip", dlHandler.DownloadZIP)
		r.Get("/api/v1/galleries/{id}/download-audit", dlHandler.GetAudit)
		// GAL-FR-161: CSV export for delivery audit reconciliation
		r.Get("/api/v1/galleries/{id}/download-audit.csv", dlHandler.GetAuditCSV)
	}

	// M14: Print DPI preflight (GAL-FR-160) — pure-logic endpoint, no deps
	preflightHandler := NewPrintPreflightHandler()
	r.Post("/api/v1/commerce/print-preflight", preflightHandler.Evaluate)

	// M14: Proofing → fulfillment bridge (GAL-FR-159)
	if deps.FulfillmentBridge != nil {
		bridgeHandler := NewProofingBridgeHandler(deps.FulfillmentBridge)
		r.Post("/api/v1/galleries/{id}/proofing/bridge", bridgeHandler.BridgeSelections)
	}

	// M14: Gallery sale banners (GAL-FR-157) — studio admin routes.
	if deps.BannerService != nil {
		bannerHandler := NewBannerHandler(deps.BannerService)
		r.Route("/api/v1/galleries/{id}/banners", func(r chi.Router) {
			r.Get("/", bannerHandler.List)
			r.Post("/", bannerHandler.Create)
			r.Put("/{bannerId}", bannerHandler.Update)
			r.Delete("/{bannerId}", bannerHandler.Delete)
		})
	}

	// M14: Analytics routes (includes GAL-FR-185/186/187 breakdowns)
	if deps.GalleryAnalyticsSvc != nil {
		analyticsHandler := NewGalleryAnalyticsHandler(deps.GalleryAnalyticsSvc)
		r.Get("/api/v1/galleries/{id}/analytics/summary", analyticsHandler.GetSummary)
		r.Get("/api/v1/galleries/{id}/analytics/daily", analyticsHandler.GetDailyStats)
		r.Get("/api/v1/galleries/{id}/analytics/devices", analyticsHandler.GetDeviceBreakdown)
		r.Get("/api/v1/galleries/{id}/analytics/download-velocity", analyticsHandler.GetDownloadVelocity)
		r.Get("/api/v1/galleries/{id}/analytics/share-channels", analyticsHandler.GetShareChannels)
	}

	// M14: Product catalog routes (GAL-FR-155)
	if deps.ProductService != nil {
		productHandler := NewProductHandler(deps.ProductService)
		r.Route("/api/v1/galleries/{id}/products", func(r chi.Router) {
			r.Get("/", productHandler.List)
			r.Post("/", productHandler.Create)
			r.Get("/{productId}", productHandler.Get)
			r.Put("/{productId}", productHandler.Update)
			r.Delete("/{productId}", productHandler.Delete)
		})
	}

	// M14: Gallery cart routes (GAL-FR-158). Mounted under the protected
	// group so studios can preview cart state; a public slug-addressed
	// variant is added under RegisterPublicGalleryRoutes for client use.
	if deps.CartService != nil {
		cartHandler := NewCartHandler(deps.CartService)
		r.Route("/api/v1/galleries/{id}/cart", func(r chi.Router) {
			r.Post("/", cartHandler.Upsert)
			r.Get("/", cartHandler.Get)
			r.Delete("/", cartHandler.Clear)
		})
	}

	// M14: Webhook routes
	if deps.WebhookSvc != nil {
		webhookHandler := NewWebhookHandler(deps.WebhookSvc)
		r.Route("/api/v1/workspaces/{workspaceId}/webhooks", func(r chi.Router) {
			r.Post("/", webhookHandler.Create)
			r.Get("/", webhookHandler.List)
			r.Delete("/{id}", webhookHandler.Delete)
			r.Get("/{id}/deliveries", webhookHandler.GetDeliveries)
		})
	}

	// NOTE: Public routes moved to RegisterPublicGalleryRoutes — must be called on outer (no-auth) router
	return galleryHandler
}

// RegisterPublicGalleryRoutes registers gallery public routes that do NOT require authentication.
// MUST be called on the outer router (not inside JWT middleware group).
func RegisterPublicGalleryRoutes(r chi.Router, deps M2Dependencies) {
	publicHandler := NewPublicGalleryHandler(deps.GalleryService, deps.AssetService, deps.ShareLinkService)
	if deps.AlbumService != nil {
		publicHandler = publicHandler.WithAlbumService(deps.AlbumService)
	}
	// GAL-FR-115 + 107/108: inject optional pool + face repo for branding
	// tier lookup and gallery-scoped FaceID matching.
	if deps.Pool != nil {
		var fr *ai.FaceRepo
		if deps.FaceRepo != nil {
			fr = deps.FaceRepo
		}
		publicHandler = publicHandler.WithM13Deps(deps.Pool, fr)
	}
	proofingHandler := NewProofingHandler(deps.ProofingService).WithGalleryService(deps.GalleryService)

	r.Route("/api/v1/public", func(r chi.Router) {
		r.Get("/galleries/{slug}", publicHandler.GetBySlug)
		r.Get("/galleries/{slug}/assets", publicHandler.ListAssets)
		r.Get("/galleries/{slug}/albums/{albumId}/assets", publicHandler.ListAlbumAssets)
		r.Get("/galleries/{slug}/assets/{assetId}/download", publicHandler.PublicAssetDownload)
		r.Post("/galleries/{slug}/verify-pin", publicHandler.VerifyPIN)
		r.Post("/galleries/{slug}/proof", proofingHandler.SubmitPublic)

		// GAL-FR-115: Plan-aware white-label branding for public gallery
		r.Get("/galleries/{slug}/branding", publicHandler.GetBranding)

		// GAL-FR-107/108: FaceID gallery entry (scoped to current gallery)
		r.Post("/galleries/{slug}/face-match", publicHandler.FaceMatch)

		// GAL-FR-112: Share link verification with access-count enforcement
		if deps.ShareLinkService != nil {
			shareHandler := NewShareLinkHandler(deps.ShareLinkService)
			r.Post("/share/{token}/verify", shareHandler.Verify)
		}

		// M14 GAL-FR-157 (public): live sale banners for a gallery slug.
		if deps.BannerService != nil && deps.GalleryService != nil {
			bannerHandler := NewBannerHandler(deps.BannerService)
			resolver := &gallerySlugResolverAdapter{svc: deps.GalleryService}
			r.Get("/galleries/{slug}/banners", bannerHandler.ListLiveBySlug(resolver))
		}

		// M14 GAL-FR-155 (public): read-only product catalog for the
		// public gallery page. ProductHandler.ListPublicBySlug was
		// defined in handler but previously orphaned — mounting it
		// here unblocks ProductPreview rendering on /g/[slug].
		if deps.ProductService != nil && deps.GalleryService != nil {
			productHandler := NewProductHandler(deps.ProductService)
			resolver := &gallerySlugResolverAdapter{svc: deps.GalleryService}
			r.Get("/galleries/{slug}/products", productHandler.ListPublicBySlug(resolver))
		}

		// M14 GAL-FR-157 follow-up: anonymous event tracking for
		// banner impressions/clicks and other low-sensitivity
		// client-side telemetry. Allow-listed event types only;
		// service is nil-safe so this mounts unconditionally when
		// the gallery service is available.
		if deps.GalleryService != nil {
			analyticsHandler := NewPublicAnalyticsHandler(deps.GalleryAnalyticsSvc)
			resolver := &gallerySlugResolverAdapter{svc: deps.GalleryService}
			r.Post("/galleries/{slug}/events", analyticsHandler.TrackPublicEvent(resolver))
		}

		// M14 GAL-FR-158 (public): anonymous cart routes addressed by slug.
		// Wired alongside M13 verify-password so a password-gated gallery
		// can still expose its cart to authenticated visitors via the
		// same session cookie flow.
		if deps.CartService != nil && deps.GalleryService != nil {
			cartHandler := NewCartHandler(deps.CartService)
			resolver := &gallerySlugResolverAdapter{svc: deps.GalleryService}
			r.Get("/galleries/{slug}/cart", cartHandler.GetBySlug(resolver))
			r.Post("/galleries/{slug}/cart", cartHandler.UpsertBySlug(resolver))
			r.Delete("/galleries/{slug}/cart", cartHandler.ClearBySlug(resolver))
		}

		// M13: Public gallery access verification
		if deps.GalleryAccessSvc != nil {
			accessHandler := NewGalleryAccessHandler(deps.GalleryAccessSvc).WithGalleryService(deps.GalleryService)
			r.Post("/galleries/{slug}/verify-password", accessHandler.VerifyPassword)
		}

		// M15: Consent management (public)
		if deps.ConsentSvc != nil {
			consentHandler := NewConsentHandler(deps.ConsentSvc)
			// Legacy single-toggle endpoint (kept for backwards compat)
			r.Post("/galleries/{slug}/consent", consentHandler.RecordConsent)
			// M15 enterprise 8-toggle bundle endpoint
			r.Post("/galleries/{slug}/consent/bundle", consentHandler.RecordBundle)
			// Status lookup for the banner (returns latest grant state per purpose)
			r.Get("/consent/status", consentHandler.GetStatus)
			// Withdrawal: prefer the slug-scoped path; legacy kept unscoped
			r.Post("/galleries/{slug}/consent/withdraw", consentHandler.WithdrawConsent)
			r.Post("/consent/withdraw", consentHandler.WithdrawConsent)
		}
	})
}

// M2Dependencies holds all service dependencies for M2 and M11 handlers.
type M2Dependencies struct {
	// M13 deferred-FR deps (optional — nil-safe)
	Pool     *pgxpool.Pool // subscription tier lookup (GAL-FR-115)
	FaceRepo *ai.FaceRepo  // gallery-scoped face match (GAL-FR-107/108)

	AssetService         *service.AssetService
	UploadService        *service.UploadService
	GalleryService       *service.GalleryService
	ShareLinkService     *service.ShareLinkService
	ProofingService      *service.ProofingService
	StorageConfigService *service.StorageConfigService
	// M11 dependencies (nil-safe — routes register only when non-nil)
	AlbumService         *service.AlbumService
	StorageAccountingSvc *service.StorageAccounting
	LifecycleService     *service.AssetLifecycleService
	AssetRepo            *repository.AssetRepo
	// M12 dependencies
	DesignTemplateSvc *service.DesignTemplateService
	GalleryRepo       *repository.GalleryRepo
	GalleryDesignSvc  *service.GalleryDesignService
	DesignCollabSvc   *service.DesignCollabService
	DesignAISvc       *service.DesignAIService
	// M13 dependencies (nil-safe)
	GalleryAccessSvc   *service.GalleryAccessService
	ProofingSessionSvc *service.ProofingSessionService
	ProofingCommentSvc *service.ProofingCommentService
	AlbumApprovalSvc   *service.AlbumApprovalService
	// M14 dependencies (nil-safe)
	DownloadService     *service.DownloadService
	GalleryAnalyticsSvc *service.GalleryAnalyticsService
	WebhookSvc          *service.WebhookService
	ProductService      *service.ProductService
	CartService         *service.CartService
	FulfillmentBridge   *service.ProofingFulfillmentBridge
	BannerService       *service.BannerService
	// M15 dependencies (nil-safe)
	ConsentSvc *service.ConsentService
	// M16 dependencies (nil-safe)
	UploadValidationSvc service.UploadManifestValidation
	// M21 dependencies (nil-safe)
	FaceSvc *ai.FaceService
	JobRepo *ai.JobRepo
}
