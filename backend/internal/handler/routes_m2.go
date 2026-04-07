package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/service"
)

// RegisterM2Routes registers all M2 (Asset Management & Gallery) routes.
func RegisterM2Routes(r chi.Router, deps M2Dependencies) {
	assetHandler := NewAssetHandler(deps.AssetService, deps.UploadService)
	galleryHandler := NewGalleryHandler(deps.GalleryService)
	shareHandler := NewShareLinkHandler(deps.ShareLinkService)
	proofingHandler := NewProofingHandler(deps.ProofingService)
	publicHandler := NewPublicGalleryHandler(deps.GalleryService, deps.AssetService, deps.ShareLinkService)
	storageConfigHandler := NewStorageConfigHandler(deps.StorageConfigService)

	// Protected asset routes
	r.Route("/api/v1/assets", func(r chi.Router) {
		r.Get("/", assetHandler.List)
		r.Post("/", assetHandler.Upload)
		r.Get("/{id}", assetHandler.GetByID)
		r.Delete("/{id}", assetHandler.SoftDelete)
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

		// Share links
		r.Post("/{id}/share", shareHandler.Create)
		r.Get("/{id}/share", shareHandler.ListByGallery)
		r.Delete("/{id}/share/{linkId}", shareHandler.Revoke)

		// Proofing
		r.Get("/{id}/proofing", proofingHandler.ListByGallery)
		r.Patch("/{id}/proofing/{selectionId}", proofingHandler.UpdateStatus)
	})

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

// M2Dependencies holds all service dependencies for M2 handlers.
type M2Dependencies struct {
	AssetService         *service.AssetService
	UploadService        *service.UploadService
	GalleryService       *service.GalleryService
	ShareLinkService     *service.ShareLinkService
	ProofingService      *service.ProofingService
	StorageConfigService *service.StorageConfigService
}
