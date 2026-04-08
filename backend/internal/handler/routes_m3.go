package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/ai"
)

// M3Dependencies holds all service dependencies for M3 AI handlers.
type M3Dependencies struct {
	AIHandler *ai.Handler
}

// RegisterM3Routes registers all M3 (AI & Intelligence) routes.
func RegisterM3Routes(r chi.Router, deps M3Dependencies) {
	h := deps.AIHandler

	r.Route("/api/v1/ai", func(r chi.Router) {
		// Face detection & clustering
		r.Post("/face-detect", h.TriggerFaceDetect)
		r.Get("/clusters", h.ListClusters)
		r.Post("/clusters/merge", h.MergeClusters)
		r.Patch("/clusters/{id}", h.UpdateCluster)
		r.Post("/clusters/{id}/split", h.SplitCluster)

		// Semantic search
		r.Post("/search", h.SemanticSearch)

		// Auto-tagging
		r.Post("/tags", h.TriggerTags)
		r.Get("/tags/{assetId}", h.GetTags)
		r.Patch("/tags/{assetId}", h.EditTags)

		// BYOK config
		r.Post("/config", h.SaveConfig)
		r.Get("/config", h.GetConfig)
		r.Delete("/config", h.DeleteConfig)
		r.Post("/config/validate", h.ValidateKey)

		// Duplicates
		r.Post("/duplicates/scan", h.ScanDuplicates)
		r.Get("/duplicates", h.ListDuplicates)
		r.Get("/duplicates/{id}", h.GetDuplicateGroup)
		r.Post("/duplicates/{id}/resolve", h.ResolveDuplicate)
		r.Post("/duplicates/{id}/dismiss", h.DismissDuplicate)

		// Smart culling
		r.Post("/cull", h.TriggerCulling)
		r.Get("/cull/{jobId}", h.GetCullingSuggestions)

		// Spend tracking
		r.Get("/spend", h.GetSpend)
		r.Put("/spend/cap", h.SetSpendCap)
		r.Get("/credits", h.GetCredits)

		// Jobs
		r.Get("/jobs/{id}", h.GetJob)
	})
}
