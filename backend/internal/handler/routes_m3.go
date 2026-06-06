package handler

import (
	"github.com/go-chi/chi/v5"

	"github.com/rawdrive/backend/internal/ai"
)

type M3Dependencies struct {
	AIHandler           *ai.Handler
	EdgeDeliveryHandler *EdgeDeliveryHandler
}

func RegisterM3Routes(r chi.Router, deps M3Dependencies) {
	h := deps.AIHandler
	r.Route("/api/v1/ai", func(r chi.Router) {
		r.Post("/face-detect", h.TriggerFaceDetect)
		r.Get("/clusters", h.ListClusters)
		r.Post("/clusters/merge", h.MergeClusters)
		r.Patch("/clusters/{id}", h.UpdateCluster)
		r.Post("/clusters/{id}/split", h.SplitCluster)
		// M3 E8-S3: face filter + smart album from cluster
		r.Get("/clusters/{id}/faces", h.GetClusterFaces)
		r.Get("/clusters/{id}/assets", h.GetClusterAssets)
		r.Post("/clusters/{id}/create-album", h.CreateClusterSmartAlbum)
		// "Photo Search" — webcam-driven find-this-person inside a gallery.
		// Multipart upload of a single image; returns matched cluster +
		// gallery-scoped asset list. See handler.FaceSearch.
		r.Post("/face-search", h.FaceSearch)
		r.Post("/search", h.SemanticSearch)
		r.Post("/tags", h.TriggerTags)
		r.Get("/tags/{assetId}", h.GetTags)
		r.Patch("/tags/{assetId}", h.EditTags)
		r.Post("/config", h.SaveConfig)
		r.Get("/config", h.GetConfig)
		r.Delete("/config", h.DeleteConfig)
		r.Post("/config/validate", h.ValidateKey)
		r.Post("/duplicates/scan", h.ScanDuplicates)
		r.Get("/duplicates", h.ListDuplicates)
		r.Get("/duplicates/{id}", h.GetDuplicateGroup)
		r.Post("/duplicates/{id}/resolve", h.ResolveDuplicate)
		r.Post("/duplicates/{id}/dismiss", h.DismissDuplicate)
		r.Post("/cull", h.TriggerCulling)
		r.Get("/cull/{jobId}", h.GetCullingSuggestions)
		r.Post("/aesthetic-score", h.TriggerAestheticScore)
		r.Get("/aesthetic-score/{assetId}", h.GetAestheticScore)
		r.Post("/burst-group", h.TriggerBurstGrouping)
		r.Get("/burst-groups", h.ListBurstGroups)
		r.Get("/spend", h.GetSpend)
		r.Put("/spend/cap", h.SetSpendCap)
		r.Get("/credits", h.GetCredits)
		r.Get("/jobs/{id}", h.GetJob)
	})
	if deps.EdgeDeliveryHandler != nil {
		r.Get("/api/v1/edge/{assetId}/{variant}", deps.EdgeDeliveryHandler.ServeDerivative)
	}
}
