package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// RegisterM2Routes registers all M2 (Asset Management & Gallery) and M11 (Processing, Storage, Organization) routes.
func RegisterM2Routes(r chi.Router, deps M2Dependencies) {
	assetHandler := NewAssetHandler(deps.AssetService, deps.UploadService)
	galleryHandler := NewGalleryHandler(deps.GalleryService)
	shareHandler := NewShareLinkHandler(deps.ShareLinkService)
	proofingHandler := NewProofingHandler(deps.ProofingService)
	publicHandler := NewPublicGalleryHandler(deps.GalleryService, deps.AssetService, deps.ShareLinkService)
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
		r.Post("/{id}/assets", galleryHandler.AddAsset)
		r.Delete("/{id}/assets/{assetId}", galleryHandler.RemoveAsset)
		r.Get("/{id}/assets", galleryHandler.ListAssets)
		r.Get("/{id}/assets/timeline", galleryHandler.Timeline)

		// M11: Albums (sub-galleries)
		if albumHandler != nil {
			r.Get("/{id}/albums", albumHandler.List)
			r.Post("/{id}/albums", albumHandler.Create)
		}

		// M11: Processing retry
		if processingStatusHandler != nil {
			r.Post("/{galleryId}/assets/retry-failed", processingStatusHandler.BulkRetry)
		}

		// Share links
		r.Post("/{id}/share", shareHandler.Create)
		r.Get("/{id}/share", shareHandler.ListByGallery)
		r.Delete("/{id}/share/{linkId}", shareHandler.Revoke)

		// Proofing
		r.Get("/{id}/proofing", proofingHandler.ListByGallery)
		r.Patch("/{id}/proofing/{selectionId}", proofingHandler.UpdateStatus)
	})

	// M11: Album detail routes
	if albumHandler != nil {
		r.Route("/api/v1/albums", func(r chi.Router) {
			r.Get("/{id}", albumHandler.GetByID)
			r.Delete("/{id}", albumHandler.Delete)
			r.Get("/{id}/breadcrumb", albumHandler.Breadcrumb)
		})
	}

	// M11: Storage analytics and usage
	if storageAnalyticsHandler != nil {
		r.Route("/api/v1/storage", func(r chi.Router) {
			r.Get("/analytics", storageAnalyticsHandler.GetAnalytics)
			r.Get("/usage", storageAnalyticsHandler.GetUsage)
		})
	}

	// Storage config (workspace settings)
	r.Route("/api/v1/workspaces/{workspaceId}/storage-config", func(r chi.Router) {
		r.Post("/test", storageConfigHandler.TestConnection)
	})

	// Public routes (no auth required)
	r.Route("/api/v1/public", func(r chi.Router) {
		r.Get("/galleries/{slug}", publicHandler.GetBySlug)
		r.Get("/galleries/{slug}/assets", publicHandler.ListAssets)
		r.Post("/galleries/{slug}/verify-pin", publicHandler.VerifyPIN)
		r.Post("/galleries/{slug}/proof", proofingHandler.SubmitPublic)
	})
}

// M2Dependencies holds all service dependencies for M2 and M11 handlers.
type M2Dependencies struct {
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
}
