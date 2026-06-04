package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/ai"
	"github.com/rawdrive/backend/internal/email"
	"github.com/rawdrive/backend/internal/face"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/storage"
)

// RegisterM2Routes registers all M2 (Asset Management & Gallery) and M11 (Processing, Storage, Organization) routes.
// Returns the GalleryHandler so callers can wire AI deps post-hoc after AI init.
func RegisterM2Routes(r chi.Router, deps M2Dependencies) *GalleryHandler {
	// M16 E47-S5: chain the Tier D validation service onto the asset handler
	// when it is wired (nil-safe — pre-M16 callers continue to work).
	assetHandler := NewAssetHandler(deps.AssetService, deps.UploadService).
		WithValidation(deps.UploadValidationSvc).
		WithTermsGate(deps.TermsGate).
		WithAssetRepo(deps.AssetRepo)
	galleryHandler := NewGalleryHandler(deps.GalleryService)
	if deps.Pool != nil {
		galleryHandler.WithPool(deps.Pool)
	}
	// M21: wire face scan deps when available
	if deps.FaceSvc != nil && deps.AssetService != nil && deps.JobRepo != nil {
		galleryHandler.WithAIDeps(deps.FaceSvc, deps.AssetService, deps.JobRepo)
	}
	shareHandler := NewShareLinkHandler(deps.ShareLinkService).
		WithGalleryShareEmail(deps.GalleryShareSender, deps.GalleryService, deps.PublicBaseURL, deps.GalleryShareLogRepo)
	proofingHandler := NewProofingHandler(deps.ProofingService).
		WithGalleryService(deps.GalleryService)
	storageConfigHandler := NewStorageConfigHandler(deps.StorageConfigService)

	// M11 handlers
	var albumHandler *AlbumHandler
	if deps.AlbumService != nil {
		albumHandler = NewAlbumHandler(deps.AlbumService)
		if deps.Pool != nil {
			// Q-2b: wire the pool so ?include_assets=true on the album asset
			// endpoint bulk-hydrates via poolAssetBatchSource (one query),
			// mirroring the gallery list seam.
			albumHandler.WithPool(deps.Pool)
		}
	}
	var storageAnalyticsHandler *StorageAnalyticsHandler
	if deps.StorageAccountingSvc != nil {
		storageAnalyticsHandler = NewStorageAnalyticsHandler(deps.StorageAccountingSvc)
	}
	dashboardHandler := NewDashboardHandler(deps.Pool)
	var processingStatusHandler *ProcessingStatusHandler
	if deps.AssetRepo != nil {
		processingStatusHandler = NewProcessingStatusHandler(deps.AssetRepo)
	}
	var encryptedDerivativeHandler *EncryptedDerivativeHandler
	if deps.AssetRepo != nil && deps.AssetDerivativeRepo != nil && deps.StorageProvider != nil {
		encryptedDerivativeHandler = NewEncryptedDerivativeHandler(deps.AssetRepo, deps.AssetDerivativeRepo, deps.StorageProvider)
	}
	var lifecycleHandler *LifecycleHandler
	if deps.LifecycleService != nil {
		lifecycleHandler = NewLifecycleHandler(deps.LifecycleService)
	}
	var bulkHandler *BulkAssetHandler
	if deps.AssetRepo != nil {
		bulkHandler = NewBulkAssetHandler(deps.AssetRepo)
		if deps.AssetService != nil {
			bulkHandler = bulkHandler.WithAssetDeleteService(deps.AssetService)
		}
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
		if encryptedDerivativeHandler != nil {
			r.Post("/{id}/derivatives", encryptedDerivativeHandler.Upload)
		}
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
		r.Get("/{id}/workspace-summary", galleryHandler.WorkspaceSummary)
		r.Patch("/{id}/client-link", galleryHandler.LinkRelationships)
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
			r.Get("/{galleryId}/albums", albumHandler.List)
			r.Post("/{galleryId}/albums", albumHandler.Create)
		}

		// M11: Processing retry
		if processingStatusHandler != nil {
			r.Post("/{galleryId}/assets/retry-failed", processingStatusHandler.BulkRetry)
		}

		// M12: Gallery Design Studio
		if deps.GalleryDesignSvc != nil {
			designHandler := NewGalleryDesignHandler(deps.GalleryDesignSvc).WithGalleryResolver(deps.GalleryService)
			r.Get("/{id}/design", designHandler.GetDesign)
			r.Put("/{id}/design", designHandler.UpdateDesign)
			// 2026-05-18 — YouTube/Vimeo embed feature. Lives under the
			// design handler because it's another gallery-settings
			// passthrough using the same raw-map pattern, not because
			// videos are conceptually part of "design". The route is
			// kept distinct so the surfaces don't entangle.
			r.Put("/{id}/embedded-videos", designHandler.UpdateEmbeddedVideos)
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
			collabHandler := NewDesignCollabHandler(deps.DesignCollabSvc).WithGalleryResolver(deps.GalleryService)
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

		// M41/105: Owner-facing guest favorites aggregation. The public
		// counterpart endpoints are mounted in RegisterPublicGalleryRoutes
		// below. Conditional mount mirrors the pattern used by other M11+
		// nullable services — if the favorites service wasn't wired in
		// main.go (e.g. test harness without DB), this entire block stays
		// dormant rather than crashing on a nil method receiver.
		if deps.GalleryFavoritesService != nil {
			favHandler := NewGalleryFavoritesHandler(deps.GalleryFavoritesService).WithGalleryResolver(deps.GalleryService)
			r.Get("/{id}/favorites", favHandler.Summarize)
		}

		// M13: Gallery Access Control
		if deps.GalleryAccessSvc != nil {
			accessHandler := NewGalleryAccessHandler(deps.GalleryAccessSvc).WithGalleryService(deps.GalleryService)
			r.Post("/{id}/password", accessHandler.SetPassword)
			r.Patch("/{id}/access-mode", accessHandler.SetAccessMode)
			r.Post("/{id}/view-as-client", accessHandler.ViewAsClient)
			r.Get("/{id}/access-logs", accessHandler.GetAccessLogs)
			r.Patch("/{id}/proofing/deadline", accessHandler.SetProofingDeadline)
		}

		// M13: Enhanced Proofing (sessions, comments, album approval)
		if deps.ProofingSessionSvc != nil {
			psHandler := NewProofingSessionHandler(deps.ProofingSessionSvc, deps.ProofingCommentSvc, deps.AlbumApprovalSvc).WithGalleryResolver(deps.GalleryService)
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
			r.Get("/", capabilityIndex("albums", []string{"{id}", "{id}/breadcrumb", "{id}/assets"}))
			r.Get("/{id}", albumHandler.GetByID)
			r.Patch("/{id}", albumHandler.Update)
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

	r.Route("/api/v1/dashboard", func(r chi.Router) {
		r.Get("/", capabilityIndex("dashboard", []string{"gallery-activity"}))
		r.Get("/gallery-activity", dashboardHandler.GetGalleryActivity)
	})

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

		// PR-3c: workspace-level face-recognition opt-in. Backs the
		// Settings → Face Recognition toggle. Same "current" literal +
		// JWT workspace id pattern as /profile above.
		faceRecHandler := &WorkspaceFaceRecognitionHandler{DB: deps.Pool}
		r.Get("/api/v1/workspaces/current/face-recognition", faceRecHandler.Get)
		r.Patch("/api/v1/workspaces/current/face-recognition", faceRecHandler.Patch)

		subHandler := &SubscriptionHandler{DB: deps.Pool}
		r.Get("/api/v1/workspace/subscription", subHandler.Get)

		r.Get("/api/v1/workspace/subscription/payment-providers", deps.SubscriptionUpgradeHandler.PaymentProviders)
		r.Post("/api/v1/workspace/subscription/upgrade", deps.SubscriptionUpgradeHandler.Upgrade)
		// 2026-05-18: interactive payment verification — the Razorpay
		// Checkout `handler` callback POSTs the payment_id/order_id/
		// signature triple here, the server HMAC-verifies it, applies
		// the plan upgrade (idempotently sharing applyPayment with the
		// webhook), and returns the new plan_tier so the UI updates
		// immediately. Required for localhost dev where Razorpay servers
		// can't reach the webhook URL.
		r.Post("/api/v1/workspace/subscription/verify", deps.SubscriptionUpgradeHandler.Verify)
	}

	// M14: Download routes
	if deps.DownloadService != nil {
		dlHandler := NewDownloadHandler(deps.DownloadService).WithGalleryResolver(deps.GalleryService)
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
		if deps.Pool != nil {
			deps.GalleryAnalyticsSvc.WithAssetAnalyticsRepo(repository.NewGalleryAssetAnalyticsRepo(deps.Pool))
		}
		analyticsHandler := NewGalleryAnalyticsHandler(deps.GalleryAnalyticsSvc).WithGalleryResolver(deps.GalleryService)
		r.Get("/api/v1/galleries/{id}/analytics/summary", analyticsHandler.GetSummary)
		r.Get("/api/v1/galleries/{id}/analytics/daily", analyticsHandler.GetDailyStats)
		r.Get("/api/v1/galleries/{id}/analytics/devices", analyticsHandler.GetDeviceBreakdown)
		r.Get("/api/v1/galleries/{id}/analytics/download-velocity", analyticsHandler.GetDownloadVelocity)
		r.Get("/api/v1/galleries/{id}/analytics/share-channels", analyticsHandler.GetShareChannels)
		r.Get("/api/v1/galleries/{id}/analytics/top-views", analyticsHandler.GetTopViews)
		r.Get("/api/v1/galleries/{id}/analytics/top-downloads", analyticsHandler.GetTopDownloads)
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
	if deps.GalleryAccessSvc != nil {
		publicHandler = publicHandler.WithGalleryAccessService(deps.GalleryAccessSvc)
	}
	// 2026-05-18: wire the watermark baker for the public download path.
	// WatermarkService is stateless — constructing one inline avoids
	// threading it through M2Dependencies for what is a single-handler
	// dependency. When the gallery's watermark_config.enabled is true the
	// download will be re-encoded as a watermarked JPEG; otherwise the
	// original streams through unchanged.
	publicHandler = publicHandler.WithWatermarkService(service.NewWatermarkService())
	// GAL-FR-115 + 107/108: inject optional pool + face repo for branding
	// tier lookup and gallery-scoped FaceID matching.
	if deps.Pool != nil {
		var fr *ai.FaceRepo
		if deps.FaceRepo != nil {
			fr = deps.FaceRepo
		}
		publicHandler = publicHandler.WithM13Deps(deps.Pool, fr)
	}
	// Anonymous Photo Search needs the face-svc client to detect + embed
	// the captured frame server-side. Nil-safe — without this the
	// endpoint returns 503.
	if deps.FaceClient != nil {
		publicHandler = publicHandler.WithFaceClient(deps.FaceClient)
	}
	proofingHandler := NewProofingHandler(deps.ProofingService).
		WithGalleryService(deps.GalleryService).
		WithGalleryAccessService(deps.GalleryAccessSvc).
		WithShareLinkService(deps.ShareLinkService)

	r.Route("/api/v1/public", func(r chi.Router) {
		r.Get("/studios/{subdomain}", publicHandler.GetStudioLanding)
		r.Get("/studios/{subdomain}/logo", publicHandler.GetStudioLogo)
		r.Get("/galleries/{slug}", publicHandler.GetBySlug)
		r.Get("/galleries/{slug}/assets", publicHandler.ListAssets)
		r.Get("/galleries/{slug}/albums", publicHandler.ListAlbums)
		r.Get("/galleries/{slug}/albums/{albumId}/assets", publicHandler.ListAlbumAssets)
		r.Get("/galleries/{slug}/assets/{assetId}/download", publicHandler.PublicAssetDownload)
		// F-009 (audit 2026-05-30): brute-force defence for the gallery PIN
		// gate. Without a PIN-specific limiter a numeric/short PIN can be
		// enumerated under only the loose global 600/min IP limit. Mirror the
		// M8 stream verify-pin hardening (routes_m8.go) — wrap with
		// RequirePINRateLimit (5 attempts / 5 min).
		//
		// middleware.RequirePINRateLimit keys on (clientIP, chi URL param
		// "id"), matching the M8 stream route whose segment is named {id}.
		// This gallery route names its segment {slug}, so aliasGalleryPINKey
		// copies the matched {slug} value into an "id" route param BEFORE the
		// limiter runs. The limiter then keys on (IP, slug) — per the F-009
		// recommendation — instead of seeing an empty key and passing through
		// unthrottled. Order matters: the alias must precede the limiter.
		// Nil-safe: when deps.PINRateLimiter is nil RequirePINRateLimit is a
		// no-op pass-through, so existing wiring keeps working.
		r.With(aliasGalleryPINKey, middleware.RequirePINRateLimit(deps.PINRateLimiter)).
			Post("/galleries/{slug}/verify-pin", publicHandler.VerifyPIN)
		r.Post("/galleries/{slug}/proof", proofingHandler.SubmitPublic)

		// PR-3b: public People tab (face recognition). Gated on
		// workspaces.face_recognition_enabled AND
		// galleries.face_detection_enabled — both must be true for
		// these endpoints to return non-empty results. See
		// public_gallery_handler.go for the gate logic.
		r.Get("/galleries/{slug}/people", publicHandler.ListPeople)
		r.Get("/galleries/{slug}/people/{personId}/photos", publicHandler.ListPersonPhotos)
		// Anonymous Photo Search — webcam capture → gallery-scoped face
		// match. Same gates as the People tab. See
		// public_gallery_handler.PhotoSearch.
		r.Post("/galleries/{slug}/photo-search", publicHandler.PhotoSearch)

		// M41/105: Anonymous guest favorites — Star button in the public
		// lightbox writes here. Toggleable (POST adds, DELETE removes)
		// and keyed on an opaque guest_session_id from localStorage so
		// favorites survive page refreshes without forcing email capture.
		// See migration 105 for the schema rationale separating these
		// from proofing_selections.
		if deps.GalleryFavoritesService != nil {
			// S4-G6 (audit 2026-05-31): wire the password/access-mode/share gate
			// so guest favorites on a protected gallery require a valid session.
			favHandler := NewGalleryFavoritesHandler(deps.GalleryFavoritesService).
				WithAccessGate(deps.GalleryService, deps.GalleryAccessSvc, deps.ShareLinkService)
			r.Post("/galleries/{slug}/favorites/{assetId}", favHandler.Add)
			r.Delete("/galleries/{slug}/favorites/{assetId}", favHandler.Remove)
			r.Get("/galleries/{slug}/favorites", favHandler.ListForSession)
		}

		// GAL-FR-115: Plan-aware white-label branding for public gallery
		r.Get("/galleries/{slug}/branding", publicHandler.GetBranding)
		r.Get("/galleries/{slug}/branding/logo", publicHandler.GetBrandingLogo)

		// Gallery Enhancements June 2026: slideshow background music. Streams the
		// audio asset through the app behind the full public access gate.
		r.Get("/galleries/{slug}/music", publicHandler.GetGalleryMusic)

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
			// Status lookup for the banner (latest grant state per purpose),
			// scoped to the gallery the visitor already holds. Security audit
			// V11: the former global GET /consent/status?email= was an
			// unauthenticated cross-gallery PII / membership oracle and has been
			// removed in favour of this (gallery_id, email)-bound lookup.
			r.Get("/galleries/{slug}/consent/status", consentHandler.GetStatusBySlug)
			// Withdrawal: prefer the slug-scoped path; legacy kept unscoped
			r.Post("/galleries/{slug}/consent/withdraw", consentHandler.WithdrawConsent)
			r.Post("/consent/withdraw", consentHandler.WithdrawConsent)
		}
	})

	// Subscription upgrade payment webhooks (no auth; provider signatures are
	// verified inside the handlers).
	r.Post("/api/v1/webhooks/razorpay/subscription", deps.SubscriptionUpgradeHandler.Webhook)
	r.Post("/api/v1/webhooks/phonepe/subscription", deps.SubscriptionUpgradeHandler.PhonePeWebhook)
}

// aliasGalleryPINKey bridges the public gallery verify-pin route (segment
// named {slug}) to middleware.RequirePINRateLimit, which keys its limiter on
// the chi URL param "id" (the M8 stream route uses {id}). It copies the
// matched {slug} value into an "id" route param so the limiter keys on
// (clientIP, slug) instead of seeing an empty key and passing through
// unthrottled (F-009). It is a no-op when no {slug} is present or when an
// "id" param already exists, so it is safe to chain ahead of the limiter on
// any route. The downstream handler continues to read {slug} unchanged —
// chi.URLParam walks keys from the end, so the original {slug} entry is
// untouched.
func aliasGalleryPINKey(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if rctx := chi.RouteContext(r.Context()); rctx != nil {
			if chi.URLParam(r, "id") == "" {
				if slug := chi.URLParam(r, "slug"); slug != "" {
					rctx.URLParams.Add("id", slug)
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

// M2Dependencies holds all service dependencies for M2 and M11 handlers.
type M2Dependencies struct {
	// M13 deferred-FR deps (optional — nil-safe)
	Pool       *pgxpool.Pool // subscription tier lookup (GAL-FR-115)
	FaceRepo   *ai.FaceRepo  // gallery-scoped face match (GAL-FR-107/108)
	FaceClient *face.Client  // optional face-svc client — when wired
	// enables the anonymous Photo Search endpoint on the public side.
	// Nil-safe: when unwired the handler returns 503.

	// F-009: brute-force defence for the public gallery PIN gate. Optional —
	// when nil, RequirePINRateLimit is a no-op pass-through (matches the M8
	// stream verify-pin wiring). Construct with
	// middleware.NewMemoryPINRateLimiter(5, 5*time.Minute) in main.go; reuse
	// the same shared limiter as the stream endpoint when available.
	PINRateLimiter middleware.PINRateLimiter

	AssetService        *service.AssetService
	UploadService       *service.UploadService
	GalleryService      *service.GalleryService
	ShareLinkService    *service.ShareLinkService
	GalleryShareSender  *email.GalleryShareSender
	GalleryShareLogRepo *repository.GalleryShareLogRepo
	PublicBaseURL       string
	ProofingService     *service.ProofingService
	// M41/105: anonymous guest favorites for the public viewer. Nil-safe —
	// the favorites routes (3 public + 1 owner) are conditionally mounted
	// inside RegisterM2Routes / RegisterPublicGalleryRoutes so the rest of
	// the gallery surface keeps working when the service isn't wired (e.g.
	// in-memory test harnesses without a DB pool).
	GalleryFavoritesService *service.GalleryFavoritesService
	StorageConfigService    *service.StorageConfigService
	// M11 dependencies (nil-safe — routes register only when non-nil)
	AlbumService         *service.AlbumService
	StorageAccountingSvc *service.StorageAccounting
	LifecycleService     *service.AssetLifecycleService
	AssetRepo            *repository.AssetRepo
	AssetDerivativeRepo  *repository.AssetDerivativeRepo
	StorageProvider      storage.Provider
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
	// Subscription upgrade payment (nil when RAZORPAY_* env vars are absent)
	SubscriptionUpgradeHandler *SubscriptionUpgradeHandler

	// M15 dependencies (nil-safe)
	ConsentSvc *service.ConsentService
	// M16 dependencies (nil-safe)
	UploadValidationSvc service.UploadManifestValidation
	// Migration 144: hard upload gate for both chunked and direct multipart
	// uploads. Satisfied by *service.TermsService.
	TermsGate TermsGate
	// M21 dependencies (nil-safe)
	FaceSvc *ai.FaceService
	JobRepo *ai.JobRepo
}
