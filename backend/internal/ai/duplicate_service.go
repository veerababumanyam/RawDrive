package ai

import (
	"context"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

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

// Duplicate detection tuning for the HNSW ANN self-join that replaced the
// original O(n²) pairwise scan.
const (
	// duplicateSimThreshold is the cosine similarity at/above which two images
	// count as near-identical (preserved from the original scan).
	duplicateSimThreshold = 0.92
	// duplicateNeighbors caps how many nearest neighbours the HNSW search returns
	// per asset. Clusters larger than this are still fully grouped via transitive
	// union-find (each near-identical member finds the others among its neighbours).
	duplicateNeighbors = 50
	// duplicateEfSearch raises hnsw.ef_search for the scan so recall stays high in
	// the near-duplicate regime; pgvector requires it to be >= the LIMIT.
	duplicateEfSearch = 100
)

// DetectDuplicates finds near-identical images using embedding similarity.
//
// Rather than load every embedding and compare all O(n²) pairs in Go (the
// previous implementation, which also recomputed cosine similarity with a
// hand-rolled Newton's-method sqrt), this runs a single ANN self-join over the
// HNSW index idx_assets_embedding_hnsw (assets.embedding, vector_cosine_ops): for
// each asset the LATERAL subquery asks the index for its nearest neighbours
// (ORDER BY b.embedding <=> a.embedding LIMIT K) and we keep only those within the
// similarity threshold (cosine distance <= 1-threshold). Grouping stays a
// transitive union-find in Go but now consumes index-found candidate pairs, so the
// cost is ~O(n·log n·K) instead of O(n²).
func (s *DuplicateService) DetectDuplicates(ctx context.Context, workspaceID uuid.UUID, galleryID *uuid.UUID) ([]DuplicateGroup, error) {
	maxDist := 1.0 - duplicateSimThreshold

	innerGalleryFilter, outerGalleryFilter := "", ""
	args := []any{workspaceID, maxDist, duplicateNeighbors}
	if galleryID != nil {
		args = append(args, *galleryID)
		innerGalleryFilter = ` AND b.id IN (SELECT asset_id FROM gallery_assets WHERE gallery_id = $4)`
		outerGalleryFilter = ` AND a.id IN (SELECT asset_id FROM gallery_assets WHERE gallery_id = $4)`
	}

	// ANN self-join: the inner ORDER BY b.embedding <=> a.embedding LIMIT $3 is the
	// canonical HNSW-served nearest-neighbour query, evaluated once per outer asset.
	pairQuery := `
		SELECT a.id, n.id, 1 - (a.embedding <=> n.embedding) AS sim
		FROM assets a
		CROSS JOIN LATERAL (
			SELECT b.id, b.embedding
			FROM assets b
			WHERE b.workspace_id = $1
			  AND b.embedding IS NOT NULL
			  AND b.deleted_at IS NULL
			  AND b.id <> a.id` + innerGalleryFilter + `
			ORDER BY b.embedding <=> a.embedding
			LIMIT $3
		) n
		WHERE a.workspace_id = $1
		  AND a.embedding IS NOT NULL
		  AND a.deleted_at IS NULL` + outerGalleryFilter + `
		  AND (a.embedding <=> n.embedding) <= $2`

	// Run inside a transaction so SET LOCAL hnsw.ef_search applies to the self-join
	// (LOCAL is transaction-scoped) without leaking onto the pooled connection. The
	// scan is read-only, so the deferred rollback simply releases the setting.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("duplicate service: begin: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, fmt.Sprintf("SET LOCAL hnsw.ef_search = %d", duplicateEfSearch)); err != nil {
		// Non-fatal: the scan still works at the default ef_search, just lower recall.
		log.Printf("duplicate service: set ef_search: %v", err)
	}

	rows, err := tx.Query(ctx, pairQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("duplicate service: ann self-join: %w", err)
	}

	// Transitive union-find over the index-found candidate pairs. The self-join
	// yields each pair from both ends (a→b and b→a); the both-grouped branch makes
	// the duplicate row a no-op.
	grouped := make(map[uuid.UUID]*DuplicateGroup)
	assetToGroup := make(map[uuid.UUID]uuid.UUID)
	for rows.Next() {
		var aID, bID uuid.UUID
		var sim float64
		if err := rows.Scan(&aID, &bID, &sim); err != nil {
			rows.Close()
			return nil, err
		}
		gid1, ok1 := assetToGroup[aID]
		gid2, ok2 := assetToGroup[bID]
		switch {
		case ok1 && ok2:
			continue
		case ok1:
			g := grouped[gid1]
			g.Members = append(g.Members, DuplicateGroupMember{
				ID: uuid.New(), GroupID: gid1, AssetID: bID, SimilarityScore: sim,
			})
			assetToGroup[bID] = gid1
		case ok2:
			g := grouped[gid2]
			g.Members = append(g.Members, DuplicateGroupMember{
				ID: uuid.New(), GroupID: gid2, AssetID: aID, SimilarityScore: sim,
			})
			assetToGroup[aID] = gid2
		default:
			gid := uuid.New()
			grouped[gid] = &DuplicateGroup{
				ID:          gid,
				WorkspaceID: workspaceID,
				GalleryID:   galleryID,
				Status:      "pending",
				Members: []DuplicateGroupMember{
					{ID: uuid.New(), GroupID: gid, AssetID: aID, SimilarityScore: 1.0, IsRepresentative: true},
					{ID: uuid.New(), GroupID: gid, AssetID: bID, SimilarityScore: sim},
				},
			}
			assetToGroup[aID] = gid
			assetToGroup[bID] = gid
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
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
