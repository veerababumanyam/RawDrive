package ai

import (
	"context"
	"fmt"
	"log"
	"sort"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/storage"
)

// CullingService handles smart culling suggestions for galleries.
type CullingService struct {
	pool       *pgxpool.Pool
	configRepo *ConfigRepo
	spendRepo  *SpendRepo
	gemini     *GeminiClient
	jobRepo    *JobRepo
	store      storage.Provider
}

// NewCullingService creates a CullingService.
func NewCullingService(pool *pgxpool.Pool, configRepo *ConfigRepo, spendRepo *SpendRepo, gemini *GeminiClient, jobRepo *JobRepo, store storage.Provider) *CullingService {
	return &CullingService{pool: pool, configRepo: configRepo, spendRepo: spendRepo, gemini: gemini, jobRepo: jobRepo, store: store}
}

// CullingSuggestion is a single photo with quality assessment and keep/review recommendation.
type CullingSuggestion struct {
	AssetID        uuid.UUID    `json:"asset_id"`
	Filename       string       `json:"filename"`
	ThumbnailURL   string       `json:"thumbnail_url,omitempty"`
	Quality        QualityScore `json:"quality"`
	Recommendation string       `json:"recommendation"` // "keep" or "review"
	Rank           int          `json:"rank"`
}

// AnalyzeGallery creates an async culling job for a gallery.
func (s *CullingService) AnalyzeGallery(ctx context.Context, workspaceID, galleryID uuid.UUID, topPercent int) (*AIJob, error) {
	if topPercent <= 0 || topPercent > 100 {
		topPercent = 20
	}
	job := &AIJob{
		WorkspaceID: workspaceID,
		Type:        "culling",
		Status:      "pending",
		Result: map[string]any{
			"gallery_id":  galleryID.String(),
			"top_percent": topPercent,
		},
	}
	if err := s.jobRepo.Create(ctx, job); err != nil {
		return nil, fmt.Errorf("culling service: create job: %w", err)
	}
	return job, nil
}

// ProcessCulling runs the actual culling analysis for a gallery.
// Called by the duplicate worker (which handles culling jobs too).
func (s *CullingService) ProcessCulling(ctx context.Context, workspaceID, galleryID uuid.UUID, topPercent int) ([]CullingSuggestion, error) {
	apiKey, _, err := s.configRepo.GetDecryptedKey(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	// Get gallery assets
	rows, err := s.pool.Query(ctx,
		`SELECT a.id, a.filename, a.storage_key, a.thumbnail_urls
		 FROM gallery_assets ga
		 JOIN assets a ON a.id = ga.asset_id
		 WHERE ga.gallery_id = $1 AND a.deleted_at IS NULL AND a.content_type LIKE 'image/%'
		 ORDER BY ga.sort_order ASC`, galleryID)
	if err != nil {
		return nil, fmt.Errorf("culling service: list assets: %w", err)
	}
	defer rows.Close()

	type assetInfo struct {
		ID           uuid.UUID
		Filename     string
		StorageKey   string
		ThumbnailURL string
	}
	var assets []assetInfo
	for rows.Next() {
		var a assetInfo
		var thumbMap map[string]string
		if err := rows.Scan(&a.ID, &a.Filename, &a.StorageKey, &thumbMap); err != nil {
			return nil, err
		}
		if u, ok := thumbMap["md"]; ok {
			a.ThumbnailURL = u
		}
		assets = append(assets, a)
	}

	if len(assets) == 0 {
		return nil, nil
	}

	// Score each asset
	suggestions := make([]CullingSuggestion, 0, len(assets))
	for _, asset := range assets {
		reader, err := s.store.Get(ctx, asset.StorageKey)
		if err != nil {
			log.Printf("culling service: get %s: %v", asset.ID, err)
			continue
		}

		imageData, err := readAll(reader)
		if err != nil {
			log.Printf("culling service: read %s: %v", asset.ID, err)
			continue
		}

		score, inputTok, outputTok, err := s.gemini.AssessQuality(ctx, apiKey, imageData, "image/jpeg")
		if err != nil {
			log.Printf("culling service: assess %s: %v", asset.ID, err)
			continue
		}

		// Log spend
		cost := EstimateCost(s.gemini.modelID, int64(inputTok), int64(outputTok))
		_ = s.spendRepo.LogUsage(ctx, &AIUsageLog{
			WorkspaceID:       workspaceID,
			Operation:         "curation",
			Model:             s.gemini.modelID,
			InputTokens:       int64(inputTok),
			OutputTokens:      int64(outputTok),
			CostEstimatePaisa: cost,
			AssetID:           &asset.ID,
		})

		// Store quality score
		_, err = s.pool.Exec(ctx,
			`INSERT INTO quality_scores (asset_id, workspace_id, sharpness, exposure, composition, overall)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (asset_id) DO UPDATE SET sharpness=$3, exposure=$4, composition=$5, overall=$6, created_at=now()`,
			asset.ID, workspaceID, score.Sharpness, score.Exposure, score.Composition, score.Overall)
		if err != nil {
			log.Printf("culling service: store score %s: %v", asset.ID, err)
		}

		suggestions = append(suggestions, CullingSuggestion{
			AssetID:      asset.ID,
			Filename:     asset.Filename,
			ThumbnailURL: asset.ThumbnailURL,
			Quality:      *score,
		})
	}

	// Sort by overall quality descending
	sort.Slice(suggestions, func(i, j int) bool {
		return suggestions[i].Quality.Overall > suggestions[j].Quality.Overall
	})

	// Mark top N% as "keep", rest as "review"
	keepCount := len(suggestions) * topPercent / 100
	if keepCount < 1 && len(suggestions) > 0 {
		keepCount = 1
	}
	for i := range suggestions {
		suggestions[i].Rank = i + 1
		if i < keepCount {
			suggestions[i].Recommendation = "keep"
		} else {
			suggestions[i].Recommendation = "review"
		}
	}

	return suggestions, nil
}

// GetSuggestions retrieves stored culling suggestions for a completed job.
func (s *CullingService) GetSuggestions(ctx context.Context, jobID uuid.UUID) ([]CullingSuggestion, error) {
	job, err := s.jobRepo.GetByID(ctx, jobID)
	if err != nil || job == nil {
		return nil, ErrJobNotFound
	}
	if job.Status != "done" {
		return nil, fmt.Errorf("culling service: job %s is %s, not done", jobID, job.Status)
	}

	galleryIDStr, ok := job.Result["gallery_id"].(string)
	if !ok {
		return nil, fmt.Errorf("culling service: job missing gallery_id")
	}
	galleryID, err := uuid.Parse(galleryIDStr)
	if err != nil {
		return nil, err
	}

	topPercent := 20
	if tp, ok := job.Result["top_percent"].(float64); ok {
		topPercent = int(tp)
	}

	// Re-read quality scores from DB
	rows, err := s.pool.Query(ctx,
		`SELECT a.id, a.filename, qs.sharpness, qs.exposure, qs.composition, qs.overall
		 FROM gallery_assets ga
		 JOIN assets a ON a.id = ga.asset_id
		 JOIN quality_scores qs ON qs.asset_id = a.id
		 WHERE ga.gallery_id = $1 AND a.deleted_at IS NULL
		 ORDER BY qs.overall DESC`, galleryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var suggestions []CullingSuggestion
	for rows.Next() {
		var cs CullingSuggestion
		if err := rows.Scan(&cs.AssetID, &cs.Filename,
			&cs.Quality.Sharpness, &cs.Quality.Exposure,
			&cs.Quality.Composition, &cs.Quality.Overall); err != nil {
			return nil, err
		}
		suggestions = append(suggestions, cs)
	}

	keepCount := len(suggestions) * topPercent / 100
	if keepCount < 1 && len(suggestions) > 0 {
		keepCount = 1
	}
	for i := range suggestions {
		suggestions[i].Rank = i + 1
		if i < keepCount {
			suggestions[i].Recommendation = "keep"
		} else {
			suggestions[i].Recommendation = "review"
		}
	}

	return suggestions, nil
}
