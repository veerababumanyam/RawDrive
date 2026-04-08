package ai

import (
	"context"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	pgvector "github.com/pgvector/pgvector-go"
	"github.com/rawdrive/backend/internal/storage"
)

// DuplicateService handles duplicate detection and smart culling.
type DuplicateService struct {
	pool       *pgxpool.Pool
	configRepo *ConfigRepo
	spendRepo  *SpendRepo
	gemini     *GeminiClient
	jobRepo    *JobRepo
	store      storage.Provider
}

// NewDuplicateService creates a DuplicateService.
func NewDuplicateService(pool *pgxpool.Pool, configRepo *ConfigRepo, spendRepo *SpendRepo, gemini *GeminiClient, jobRepo *JobRepo, store storage.Provider) *DuplicateService {
	return &DuplicateService{pool: pool, configRepo: configRepo, spendRepo: spendRepo, gemini: gemini, jobRepo: jobRepo, store: store}
}

// ScanForDuplicates creates an async duplicate scan job.
func (s *DuplicateService) ScanForDuplicates(ctx context.Context, workspaceID uuid.UUID, galleryID *uuid.UUID) (*AIJob, error) {
	job := &AIJob{
		WorkspaceID: workspaceID,
		Type:        "duplicate_scan",
		Status:      "pending",
	}
	if galleryID != nil {
		job.Result = map[string]any{"gallery_id": galleryID.String()}
	}
	if err := s.jobRepo.Create(ctx, job); err != nil {
		return nil, err
	}
	return job, nil
}

// DetectDuplicates finds near-identical images using embedding similarity.
func (s *DuplicateService) DetectDuplicates(ctx context.Context, workspaceID uuid.UUID, galleryID *uuid.UUID) ([]DuplicateGroup, error) {
	// Get all assets with embeddings in the workspace/gallery
	query := `SELECT id, embedding FROM assets
		WHERE workspace_id = $1 AND embedding IS NOT NULL AND deleted_at IS NULL`
	args := []any{workspaceID}
	if galleryID != nil {
		query += ` AND id IN (SELECT asset_id FROM gallery_assets WHERE gallery_id = $2)`
		args = append(args, *galleryID)
	}

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("duplicate service: query assets: %w", err)
	}
	defer rows.Close()

	type assetEmbed struct {
		ID        uuid.UUID
		Embedding pgvector.Vector
	}
	var assets []assetEmbed
	for rows.Next() {
		var ae assetEmbed
		if err := rows.Scan(&ae.ID, &ae.Embedding); err != nil {
			return nil, err
		}
		assets = append(assets, ae)
	}

	// Find duplicate pairs using cosine similarity >= 0.92
	grouped := make(map[uuid.UUID]*DuplicateGroup)
	assetToGroup := make(map[uuid.UUID]uuid.UUID)

	for i := 0; i < len(assets); i++ {
		for j := i + 1; j < len(assets); j++ {
			sim := cosineSimilarity(assets[i].Embedding.Slice(), assets[j].Embedding.Slice())
			if sim >= 0.92 {
				// Check if either asset is already in a group
				gid1, ok1 := assetToGroup[assets[i].ID]
				gid2, ok2 := assetToGroup[assets[j].ID]

				var groupID uuid.UUID
				if ok1 {
					groupID = gid1
				} else if ok2 {
					groupID = gid2
				} else {
					groupID = uuid.New()
					grouped[groupID] = &DuplicateGroup{
						ID:          groupID,
						WorkspaceID: workspaceID,
						GalleryID:   galleryID,
						Status:      "pending",
						Members: []DuplicateGroupMember{{
							ID: uuid.New(), GroupID: groupID, AssetID: assets[i].ID,
							SimilarityScore: 1.0, IsRepresentative: true,
						}},
					}
					assetToGroup[assets[i].ID] = groupID
				}

				if _, exists := assetToGroup[assets[j].ID]; !exists {
					group := grouped[groupID]
					group.Members = append(group.Members, DuplicateGroupMember{
						ID: uuid.New(), GroupID: groupID, AssetID: assets[j].ID,
						SimilarityScore: sim,
					})
					assetToGroup[assets[j].ID] = groupID
				}
			}
		}
	}

	// Persist groups
	var result []DuplicateGroup
	for _, group := range grouped {
		if len(group.Members) < 2 {
			continue
		}
		if err := s.createDuplicateGroup(ctx, group); err != nil {
			log.Printf("duplicate service: persist group: %v", err)
			continue
		}
		result = append(result, *group)
	}

	return result, nil
}

func (s *DuplicateService) createDuplicateGroup(ctx context.Context, group *DuplicateGroup) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO duplicate_groups (id, workspace_id, gallery_id, status, created_at)
		 VALUES ($1, $2, $3, $4, now())`,
		group.ID, group.WorkspaceID, group.GalleryID, group.Status)
	if err != nil {
		return err
	}

	for _, m := range group.Members {
		_, err := s.pool.Exec(ctx,
			`INSERT INTO duplicate_group_members (id, group_id, asset_id, similarity_score, is_representative)
			 VALUES ($1, $2, $3, $4, $5)`,
			m.ID, m.GroupID, m.AssetID, m.SimilarityScore, m.IsRepresentative)
		if err != nil {
			return err
		}
	}
	return nil
}

// ListDuplicateGroups returns duplicate groups for a workspace.
func (s *DuplicateService) ListDuplicateGroups(ctx context.Context, workspaceID uuid.UUID, status string, limit, offset int) ([]DuplicateGroup, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	query := `SELECT id, workspace_id, gallery_id, status, created_at FROM duplicate_groups
		WHERE workspace_id = $1`
	args := []any{workspaceID}
	argN := 2

	if status != "" {
		query += fmt.Sprintf(` AND status = $%d`, argN)
		args = append(args, status)
		argN++
	}
	query += ` ORDER BY created_at DESC LIMIT ` + fmt.Sprintf("%d OFFSET %d", limit, offset)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []DuplicateGroup
	for rows.Next() {
		var g DuplicateGroup
		if err := rows.Scan(&g.ID, &g.WorkspaceID, &g.GalleryID, &g.Status, &g.CreatedAt); err != nil {
			return nil, err
		}
		groups = append(groups, g)
	}
	return groups, rows.Err()
}

// GetDuplicateGroup returns a single group with its members.
func (s *DuplicateService) GetDuplicateGroup(ctx context.Context, groupID uuid.UUID) (*DuplicateGroup, error) {
	var g DuplicateGroup
	err := s.pool.QueryRow(ctx,
		`SELECT id, workspace_id, gallery_id, status, created_at FROM duplicate_groups WHERE id = $1`, groupID,
	).Scan(&g.ID, &g.WorkspaceID, &g.GalleryID, &g.Status, &g.CreatedAt)
	if err != nil {
		return nil, err
	}

	rows, err := s.pool.Query(ctx,
		`SELECT dgm.id, dgm.group_id, dgm.asset_id, dgm.similarity_score, dgm.is_representative,
		 qs.sharpness, qs.exposure, qs.composition, qs.overall
		 FROM duplicate_group_members dgm
		 LEFT JOIN quality_scores qs ON qs.asset_id = dgm.asset_id
		 WHERE dgm.group_id = $1`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var m DuplicateGroupMember
		var sh, ex, co, ov *float64
		if err := rows.Scan(&m.ID, &m.GroupID, &m.AssetID, &m.SimilarityScore, &m.IsRepresentative,
			&sh, &ex, &co, &ov); err != nil {
			return nil, err
		}
		if sh != nil {
			m.Quality = &QualityScore{Sharpness: *sh, Exposure: *ex, Composition: *co, Overall: *ov}
		}
		g.Members = append(g.Members, m)
	}

	return &g, rows.Err()
}

// ResolveDuplicateGroup marks a group as resolved.
func (s *DuplicateService) ResolveDuplicateGroup(ctx context.Context, groupID uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE duplicate_groups SET status = 'resolved' WHERE id = $1`, groupID)
	return err
}

// DismissDuplicateGroup marks a group as dismissed.
func (s *DuplicateService) DismissDuplicateGroup(ctx context.Context, groupID uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE duplicate_groups SET status = 'dismissed' WHERE id = $1`, groupID)
	return err
}

// ScoreQuality assesses image quality for an asset.
func (s *DuplicateService) ScoreQuality(ctx context.Context, assetID, workspaceID uuid.UUID) (*QualityScore, error) {
	apiKey, _, err := s.configRepo.GetDecryptedKey(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	reader, err := s.store.Get(ctx, assetID.String())
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	imageData, err := readAll(reader)
	if err != nil {
		return nil, err
	}

	score, inputTok, outputTok, err := s.gemini.AssessQuality(ctx, apiKey, imageData, "image/jpeg")
	if err != nil {
		return nil, err
	}

	// Log spend
	cost := EstimateCost(s.gemini.modelID, int64(inputTok), int64(outputTok))
	_ = s.spendRepo.LogUsage(ctx, &AIUsageLog{
		WorkspaceID: workspaceID, Operation: "curation", Model: s.gemini.modelID,
		InputTokens: int64(inputTok), OutputTokens: int64(outputTok),
		CostEstimatePaisa: cost, AssetID: &assetID,
	})

	// Store quality score
	_, err = s.pool.Exec(ctx,
		`INSERT INTO quality_scores (asset_id, workspace_id, sharpness, exposure, composition, overall)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (asset_id) DO UPDATE SET sharpness=$3, exposure=$4, composition=$5, overall=$6`,
		assetID, workspaceID, score.Sharpness, score.Exposure, score.Composition, score.Overall)
	if err != nil {
		// Non-fatal: log and return the score anyway
		log.Printf("duplicate service: store quality score: %v", err)
	}

	return score, nil
}

// cosineSimilarity computes cosine similarity between two float32 vectors.
func cosineSimilarity(a, b []float32) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		normA += float64(a[i]) * float64(a[i])
		normB += float64(b[i]) * float64(b[i])
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (sqrt(normA) * sqrt(normB))
}

func sqrt(x float64) float64 {
	if x <= 0 {
		return 0
	}
	z := x
	for i := 0; i < 50; i++ {
		z = (z + x/z) / 2
	}
	return z
}
