package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	pgvector "github.com/pgvector/pgvector-go"

	"github.com/rawdrive/backend/internal/storage"
)

// SearchService handles semantic search, auto-tagging, and embedding generation.
type SearchService struct {
	pool       *pgxpool.Pool
	configRepo *ConfigRepo
	spendRepo  *SpendRepo
	gemini     *GeminiClient
	store      storage.Provider
}

// NewSearchService creates a SearchService.
func NewSearchService(pool *pgxpool.Pool, configRepo *ConfigRepo, spendRepo *SpendRepo, gemini *GeminiClient, store storage.Provider) *SearchService {
	return &SearchService{pool: pool, configRepo: configRepo, spendRepo: spendRepo, gemini: gemini, store: store}
}

// AutoTag generates AI tags and caption for an asset.
func (s *SearchService) AutoTag(ctx context.Context, assetID, workspaceID uuid.UUID) error {
	apiKey, _, err := s.configRepo.GetDecryptedKey(ctx, workspaceID)
	if err != nil {
		return err
	}

	// Read image
	reader, err := s.store.Get(ctx, assetID.String())
	if err != nil {
		return fmt.Errorf("search service: get asset: %w", err)
	}
	defer reader.Close()

	imageData, err := readAll(reader)
	if err != nil {
		return fmt.Errorf("search service: read image: %w", err)
	}

	tags, caption, inputTok, outputTok, err := s.gemini.GenerateTags(ctx, apiKey, imageData, "image/jpeg")
	if err != nil {
		return err
	}

	// Log spend
	cost := EstimateCost(s.gemini.modelID, int64(inputTok), int64(outputTok))
	if err := s.spendRepo.LogUsage(ctx, &AIUsageLog{
		WorkspaceID: workspaceID, Operation: "tagging", Model: s.gemini.modelID,
		InputTokens: int64(inputTok), OutputTokens: int64(outputTok),
		CostEstimatePaisa: cost, AssetID: &assetID,
	}); err != nil {
		log.Printf("search service: log spend failed: %v", err)
	}

	// Convert to AITag format
	aiTags := make([]AITag, len(tags))
	for i, t := range tags {
		aiTags[i] = AITag{
			Tag: t.Tag, Category: t.Category, Confidence: t.Confidence,
			Source: s.gemini.modelID, Status: "pending_review",
		}
	}

	tagsJSON, _ := json.Marshal(aiTags)
	_, err = s.pool.Exec(ctx,
		`UPDATE assets SET ai_tags = $2, ai_caption = $3, ai_tag_status = 'done',
		 ai_tagged_at = now(), updated_at = now() WHERE id = $1`,
		assetID, tagsJSON, caption)
	return err
}

// IndexAsset generates and stores a semantic search embedding for an asset.
func (s *SearchService) IndexAsset(ctx context.Context, assetID, workspaceID uuid.UUID) error {
	apiKey, _, err := s.configRepo.GetDecryptedKey(ctx, workspaceID)
	if err != nil {
		return err
	}

	// Get existing tags and caption for embedding source text
	var tagsJSON []byte
	var caption *string
	err = s.pool.QueryRow(ctx,
		`SELECT ai_tags, ai_caption FROM assets WHERE id = $1`, assetID,
	).Scan(&tagsJSON, &caption)
	if err != nil {
		return fmt.Errorf("search service: get asset tags: %w", err)
	}

	// Build text for embedding. When the asset has no real semantic source
	// (no non-blank caption AND no tags) we SKIP embedding entirely rather than
	// embedding the generic "photograph" literal: that produced near-identical
	// vectors that clustered as false near-duplicates and polluted semantic
	// search (VEC-7). Such assets keep embedding = NULL and are picked up later
	// by cmd/backfill-embeddings once AutoTag has given them a real source.
	text, ok := embeddingSourceText(assetID, caption, tagsJSON)
	if !ok {
		return nil
	}

	embedding, tokensUsed, err := s.gemini.GenerateEmbedding(ctx, apiKey, text)
	if err != nil {
		return err
	}

	// Log spend against the configured embedding model so cost attribution
	// stays correct when ai.embedding_model / AI_EMBEDDING_MODEL overrides the
	// default. EstimateCost falls back to defaultPrice for unknown models.
	embeddingModel := s.gemini.EmbeddingModel()
	cost := EstimateCost(embeddingModel, int64(tokensUsed), 0)
	if err := s.spendRepo.LogUsage(ctx, &AIUsageLog{
		WorkspaceID: workspaceID, Operation: "search", Model: embeddingModel,
		InputTokens: int64(tokensUsed), CostEstimatePaisa: cost, AssetID: &assetID,
	}); err != nil {
		log.Printf("search service: log embed spend failed: %v", err)
	}

	_, err = s.pool.Exec(ctx,
		`UPDATE assets SET embedding = $2, updated_at = now() WHERE id = $1`,
		assetID, pgvector.NewVector(embedding))
	return err
}

// decodeAITags unmarshals stored ai_tags JSONB into a slice of AITag.
// On malformed JSONB it logs a WARN with the asset_id and returns nil so the
// caller degrades gracefully (e.g. caption-only embedding) instead of silently
// producing worse search results with no operator visibility.
func decodeAITags(assetID uuid.UUID, tagsJSON []byte) []AITag {
	var tags []AITag
	if err := json.Unmarshal(tagsJSON, &tags); err != nil {
		log.Printf("WARN search service: unmarshal ai_tags failed, falling back to caption-only embedding: asset_id=%s err=%v", assetID, err)
		return nil
	}
	return tags
}

// embeddingSourceText is the single shared seam that decides BOTH the embedding
// input text AND whether an asset should be embedded at all. It composes the
// source text from the asset's ai_caption and ai_tags (malformed ai_tags JSONB
// degrades to no tags via decodeAITags) and returns ok=false when there is no
// real semantic source — no non-blank caption AND no tags.
//
// Returning ok=false here is what prevents the generic "photograph" embedding
// (VEC-7): both the live SearchService.IndexAsset path and the offline
// cmd/backfill-embeddings path gate on this exact function, so an asset is never
// embedded by one path and skipped by the other. Skipped assets keep
// embedding = NULL and are re-evaluated once AutoTag gives them a real source.
func embeddingSourceText(assetID uuid.UUID, caption *string, tagsJSON []byte) (string, bool) {
	tags := decodeAITags(assetID, tagsJSON)
	hasCaption := caption != nil && strings.TrimSpace(*caption) != ""
	if !hasCaption && len(tags) == 0 {
		return "", false
	}
	return buildEmbeddingText(caption, tags), true
}

// buildEmbeddingText composes the source text used to generate an embedding from
// an optional caption and the decoded tags. Callers must gate on
// embeddingSourceText first: this helper is only reached when at least one real
// source (caption or tags) exists, so it has no generic fallback.
func buildEmbeddingText(caption *string, tags []AITag) string {
	text := ""
	if caption != nil {
		text = *caption + " "
	}
	for _, t := range tags {
		text += t.Tag + " "
	}
	return text
}

// SemanticSearch performs natural language search using pgvector similarity.
func (s *SearchService) SemanticSearch(ctx context.Context, workspaceID uuid.UUID, query string, galleryID *uuid.UUID, limit int) ([]SearchResult, error) {
	apiKey, _, err := s.configRepo.GetDecryptedKey(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	if limit <= 0 || limit > 50 {
		limit = 20
	}

	// Generate query embedding
	queryEmbed, _, err := s.gemini.GenerateEmbedding(ctx, apiKey, query)
	if err != nil {
		return nil, fmt.Errorf("search service: embed query: %w", err)
	}

	// pgvector similarity search
	sqlQuery := `SELECT a.id, a.filename, a.content_type, a.thumbnail_urls, a.ai_tags, a.ai_caption,
		1 - (a.embedding <=> $1::vector) AS similarity
		FROM assets a
		WHERE a.workspace_id = $2
		  AND a.embedding IS NOT NULL
		  AND a.deleted_at IS NULL
		  AND (a.embedding <=> $1::vector) < 0.3`

	args := []any{pgvector.NewVector(queryEmbed), workspaceID}

	if galleryID != nil {
		sqlQuery += ` AND EXISTS (SELECT 1 FROM gallery_assets ga WHERE ga.asset_id = a.id AND ga.gallery_id = $3)`
		args = append(args, *galleryID)
	}

	sqlQuery += ` ORDER BY a.embedding <=> $1::vector ASC LIMIT ` + fmt.Sprintf("%d", limit)

	rows, err := s.pool.Query(ctx, sqlQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("search service: query: %w", err)
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		var tagsJSON []byte
		var caption *string
		if err := rows.Scan(&r.AssetID, &r.Filename, &r.ContentType, &r.ThumbnailURLs, &tagsJSON, &caption, &r.Similarity); err != nil {
			return nil, fmt.Errorf("search service: scan: %w", err)
		}
		_ = json.Unmarshal(tagsJSON, &r.AITags)
		if caption != nil {
			r.AICaption = *caption
		}
		results = append(results, r)
	}

	return results, rows.Err()
}

// GetTags returns the AI tags for an asset.
func (s *SearchService) GetTags(ctx context.Context, assetID uuid.UUID) ([]AITag, string, string, error) {
	var tagsJSON []byte
	var caption *string
	var status string
	err := s.pool.QueryRow(ctx,
		`SELECT ai_tags, ai_caption, ai_tag_status FROM assets WHERE id = $1`, assetID,
	).Scan(&tagsJSON, &caption, &status)
	if err != nil {
		return nil, "", "", err
	}

	var tags []AITag
	_ = json.Unmarshal(tagsJSON, &tags)

	cap := ""
	if caption != nil {
		cap = *caption
	}
	return tags, cap, status, nil
}

// EditTags applies photographer edits to asset tags.
func (s *SearchService) EditTags(ctx context.Context, assetID uuid.UUID, patches []TagPatch) error {
	tags, _, _, err := s.GetTags(ctx, assetID)
	if err != nil {
		return err
	}

	for _, patch := range patches {
		found := false
		for i, tag := range tags {
			if tag.Tag == patch.Tag {
				found = true
				tags[i].Status = patch.Status
				if patch.Status == "edited" && patch.NewTag != "" {
					tags[i].Tag = patch.NewTag
					tags[i].Source = "manual"
				}
				break
			}
		}
		if !found {
			return fmt.Errorf("tag %q not found on asset", patch.Tag)
		}
	}

	tagsJSON, _ := json.Marshal(tags)
	_, err = s.pool.Exec(ctx,
		`UPDATE assets SET ai_tags = $2, updated_at = now() WHERE id = $1`,
		assetID, tagsJSON)
	return err
}
