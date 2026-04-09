#!/bin/bash
# Apply all M11 deferred feature modifications to existing files
# Run this script to re-apply changes that get reverted by hooks
set -e

echo "=== Applying M11 deferred features to existing files ==="

# 1. routes_m3.go — Add EdgeDeliveryHandler + aesthetic/burst routes
cat > internal/handler/routes_m3.go << 'GOEOF'
package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/ai"
)

// M3Dependencies holds all service dependencies for M3 AI handlers.
type M3Dependencies struct {
	AIHandler           *ai.Handler
	EdgeDeliveryHandler *EdgeDeliveryHandler // FR-020 (nil-safe)
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

		// FR-012: Aesthetic scoring
		r.Post("/aesthetic-score", h.TriggerAestheticScore)
		r.Get("/aesthetic-score/{assetId}", h.GetAestheticScore)

		// FR-013: Burst grouping
		r.Post("/burst-group", h.TriggerBurstGrouping)
		r.Get("/burst-groups", h.ListBurstGroups)

		// Spend tracking
		r.Get("/spend", h.GetSpend)
		r.Put("/spend/cap", h.SetSpendCap)
		r.Get("/credits", h.GetCredits)

		// Jobs
		r.Get("/jobs/{id}", h.GetJob)
	})

	// FR-020: Edge delivery routes (auth-protected, CDN-cacheable)
	if deps.EdgeDeliveryHandler != nil {
		r.Get("/api/v1/edge/{assetId}/{variant}", deps.EdgeDeliveryHandler.ServeDerivative)
	}
}
GOEOF

# 2. middleware.go — Add plain string context key for workspace_id
# Use sed to add the plain string key after the typed key line
if ! grep -q '"workspace_id", wsID' internal/middleware/middleware.go; then
  sed -i 's/ctx = context.WithValue(ctx, stateIDKey, stateID)/ctx = context.WithValue(ctx, stateIDKey, stateID)\n\t\t\tctx = context.WithValue(ctx, "workspace_id", wsID) \/\/ plain key for ai package/' internal/middleware/middleware.go
fi

# 3. thumbnail_service.go — Add GetStore accessor
if ! grep -q 'func (s \*ThumbnailService) GetStore' internal/service/thumbnail_service.go; then
  sed -i '/func NewThumbnailService.*{/,/^}/{ /^}/a\
\n// GetStore returns the storage provider (used by edge delivery handler).\nfunc (s *ThumbnailService) GetStore() storage.Provider {\n\treturn s.store\n}
}' internal/service/thumbnail_service.go
fi

# 4. asset_repo.go — Add Pool accessor
if ! grep -q 'func (r \*AssetRepo) Pool' internal/repository/asset_repo.go; then
  sed -i '/func NewAssetRepo.*{/,/^}/{ /^}/a\
\n// Pool returns the underlying database pool.\nfunc (r *AssetRepo) Pool() *pgxpool.Pool {\n\treturn r.pool\n}
}' internal/repository/asset_repo.go
fi

echo "=== Building ==="
go build -o rawdrive-api.exe ./cmd/api/ 2>&1 || echo "BUILD FAILED — check errors above"

echo "=== Done ==="
