package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	pgvector "github.com/pgvector/pgvector-go"
)

// FaceRepo handles face_clusters table operations.
type FaceRepo struct {
	pool *pgxpool.Pool
}

// NewFaceRepo creates a new FaceRepo.
func NewFaceRepo(pool *pgxpool.Pool) *FaceRepo {
	return &FaceRepo{pool: pool}
}

// StoreFaces inserts multiple face detections in a single batch.
func (r *FaceRepo) StoreFaces(ctx context.Context, faces []*FaceCluster) error {
	if len(faces) == 0 {
		return nil
	}

	batch := &pgx.Batch{}
	for _, fc := range faces {
		if fc.ID == uuid.Nil {
			fc.ID = uuid.New()
		}
		now := time.Now()
		fc.CreatedAt = now
		fc.UpdatedAt = now

		bboxJSON, _ := json.Marshal(fc.BoundingBox)

		batch.Queue(
			`INSERT INTO face_clusters (id, workspace_id, asset_id, gallery_id, face_index,
			 bounding_box, embedding, cluster_label, cluster_name, confidence, source,
			 created_at, updated_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
			fc.ID, fc.WorkspaceID, fc.AssetID, fc.GalleryID, fc.FaceIndex,
			bboxJSON, pgvector.NewVector(fc.Embedding),
			fc.ClusterLabel, fc.ClusterName, fc.Confidence, fc.Source,
			fc.CreatedAt, fc.UpdatedAt,
		)
	}

	br := r.pool.SendBatch(ctx, batch)
	defer br.Close()

	for range faces {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("face repo: store batch: %w", err)
		}
	}
	return nil
}

// GetFacesByAsset returns all faces detected in a given asset.
func (r *FaceRepo) GetFacesByAsset(ctx context.Context, assetID uuid.UUID) ([]*FaceCluster, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, asset_id, gallery_id, face_index, bounding_box,
		 cluster_label, cluster_name, confidence, source, created_at, updated_at
		 FROM face_clusters WHERE asset_id = $1 ORDER BY face_index`, assetID)
	if err != nil {
		return nil, fmt.Errorf("face repo: get by asset: %w", err)
	}
	defer rows.Close()

	return scanFaces(rows)
}

// FindSimilarFaces performs pgvector cosine distance search.
// Returns faces with cosine similarity >= threshold.
func (r *FaceRepo) FindSimilarFaces(ctx context.Context, embedding []float32, workspaceID uuid.UUID, threshold float64, limit int) ([]*FaceCluster, error) {
	maxDistance := 1.0 - threshold

	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, asset_id, gallery_id, face_index, bounding_box,
		 cluster_label, cluster_name, confidence, source, created_at, updated_at
		 FROM face_clusters
		 WHERE workspace_id = $1
		   AND cluster_label IS NOT NULL
		   AND (embedding <=> $2) <= $3
		 ORDER BY embedding <=> $2 ASC
		 LIMIT $4`,
		workspaceID, pgvector.NewVector(embedding), maxDistance, limit)
	if err != nil {
		return nil, fmt.Errorf("face repo: find similar: %w", err)
	}
	defer rows.Close()

	return scanFaces(rows)
}

// FindSimilarFacesInGallery matches an embedding against faces scoped to a single gallery.
// Used by FaceID gallery entry (GAL-FR-107/108): a client uploads a selfie embedding,
// we return matching asset IDs that appear only inside this gallery.
func (r *FaceRepo) FindSimilarFacesInGallery(ctx context.Context, embedding []float32, galleryID uuid.UUID, threshold float64, limit int) ([]*FaceCluster, error) {
	maxDistance := 1.0 - threshold

	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, asset_id, gallery_id, face_index, bounding_box,
		 cluster_label, cluster_name, confidence, source, created_at, updated_at
		 FROM face_clusters
		 WHERE gallery_id = $1
		   AND (embedding <=> $2) <= $3
		 ORDER BY embedding <=> $2 ASC
		 LIMIT $4`,
		galleryID, pgvector.NewVector(embedding), maxDistance, limit)
	if err != nil {
		return nil, fmt.Errorf("face repo: find similar in gallery: %w", err)
	}
	defer rows.Close()

	return scanFaces(rows)
}

// UpdateClusterAssignment sets cluster_label and cluster_name for a face.
func (r *FaceRepo) UpdateClusterAssignment(ctx context.Context, faceID, clusterLabel uuid.UUID, clusterName string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE face_clusters SET cluster_label = $2, cluster_name = $3, updated_at = now()
		 WHERE id = $1`, faceID, clusterLabel, clusterName)
	if err != nil {
		return fmt.Errorf("face repo: update cluster: %w", err)
	}
	return nil
}

// ListClusters returns cluster summaries for a workspace, optionally filtered by gallery.
func (r *FaceRepo) ListClusters(ctx context.Context, workspaceID uuid.UUID, galleryID *uuid.UUID) ([]*ClusterSummary, error) {
	// 2026-05-18: gallery scope resolves through gallery_assets (the source
	// of truth for asset → gallery membership), not through the denormalized
	// face_clusters.gallery_id column. The denormalized column is unreliable —
	// it's populated only when the detection job is enqueued with a gallery
	// hint, but the ThumbnailWorker auto-enqueue path (PR-2b) doesn't know
	// which gallery an asset belongs to and passes nil, leaving the column
	// NULL. With gallery_assets as the source of truth a single asset shared
	// across multiple galleries also surfaces the same person in each
	// gallery's People tab, which is the correct behavior.
	query := `SELECT fc.cluster_label,
		 MAX(fc.cluster_name) AS cluster_name,
		 COUNT(*) AS face_count,
		 COUNT(DISTINCT fc.asset_id) AS asset_count,
		 (SELECT fc2.asset_id FROM face_clusters fc2
		  WHERE fc2.cluster_label = fc.cluster_label AND fc2.workspace_id = $1
		  ORDER BY fc2.confidence DESC LIMIT 1) AS sample_asset_id
		 FROM face_clusters fc`

	args := []any{workspaceID}
	if galleryID != nil {
		query += ` INNER JOIN gallery_assets ga ON ga.asset_id = fc.asset_id AND ga.gallery_id = $2`
		args = append(args, *galleryID)
	}
	query += ` WHERE fc.workspace_id = $1
		   AND fc.cluster_label IS NOT NULL`
	query += ` GROUP BY fc.cluster_label ORDER BY face_count DESC`

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("face repo: list clusters: %w", err)
	}
	defer rows.Close()

	var clusters []*ClusterSummary
	for rows.Next() {
		var cs ClusterSummary
		if err := rows.Scan(&cs.ClusterLabel, &cs.ClusterName, &cs.FaceCount, &cs.AssetCount, &cs.SampleAssetID); err != nil {
			return nil, fmt.Errorf("face repo: scan cluster: %w", err)
		}
		clusters = append(clusters, &cs)
	}
	return clusters, rows.Err()
}

// ListClusterAssetIDs returns distinct asset IDs that contain at least one
// face assigned to the given cluster label, scoped to the workspace so
// cross-workspace leakage is impossible at the DB layer.
//
// Used by the face filter endpoint (E8-S3 "FaceID filter") and the smart
// album smart-filter evaluator to resolve face_cluster_label → asset list.
func (r *FaceRepo) ListClusterAssetIDs(ctx context.Context, workspaceID, clusterLabel uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT DISTINCT asset_id
		 FROM face_clusters
		 WHERE workspace_id = $1 AND cluster_label = $2
		 ORDER BY asset_id`,
		workspaceID, clusterLabel)
	if err != nil {
		return nil, fmt.Errorf("face repo: list cluster assets: %w", err)
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("face repo: scan cluster asset: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ListClusterAssetIDsInGallery is the gallery-scoped variant of
// ListClusterAssetIDs. It returns DISTINCT asset_ids for the cluster
// label, filtered to a single gallery. Used by the public People tab
// (PR-3b) to ensure a guest viewer of one gallery cannot enumerate the
// same person's photos across OTHER galleries in the workspace —
// cross-gallery leakage is a real concern when one person (e.g. a
// vendor photographer) attends multiple weddings the studio hosts.
func (r *FaceRepo) ListClusterAssetIDsInGallery(ctx context.Context, galleryID, clusterLabel uuid.UUID) ([]uuid.UUID, error) {
	// JOIN through gallery_assets — same reason as ListClusters above:
	// face_clusters.gallery_id is denormalized and frequently NULL when
	// the asset was detected via the auto-enqueue path. gallery_assets
	// is the source of truth.
	rows, err := r.pool.Query(ctx,
		`SELECT DISTINCT fc.asset_id
		 FROM face_clusters fc
		 INNER JOIN gallery_assets ga ON ga.asset_id = fc.asset_id
		 WHERE ga.gallery_id = $1 AND fc.cluster_label = $2
		 ORDER BY fc.asset_id`,
		galleryID, clusterLabel)
	if err != nil {
		return nil, fmt.Errorf("face repo: list cluster assets in gallery: %w", err)
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("face repo: scan gallery cluster asset: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// DeleteFacesByAsset removes all face rows for an asset.
func (r *FaceRepo) DeleteFacesByAsset(ctx context.Context, assetID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM face_clusters WHERE asset_id = $1`, assetID)
	return err
}

// MergeClusters moves all faces from src cluster to dst cluster within a workspace.
func (r *FaceRepo) MergeClusters(ctx context.Context, workspaceID, srcLabel, dstLabel uuid.UUID, dstName string) (int, error) {
	tag, err := r.pool.Exec(ctx,
		`UPDATE face_clusters SET cluster_label = $3, cluster_name = $4, updated_at = now()
		 WHERE workspace_id = $1 AND cluster_label = $2`,
		workspaceID, srcLabel, dstLabel, dstName)
	if err != nil {
		return 0, fmt.Errorf("face repo: merge clusters: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

// SplitCluster creates a new cluster label for specified face IDs.
func (r *FaceRepo) SplitCluster(ctx context.Context, faceIDs []uuid.UUID, newLabel uuid.UUID, newName string) error {
	for _, fid := range faceIDs {
		if _, err := r.pool.Exec(ctx,
			`UPDATE face_clusters SET cluster_label = $2, cluster_name = $3, updated_at = now()
			 WHERE id = $1`, fid, newLabel, newName); err != nil {
			return fmt.Errorf("face repo: split face %s: %w", fid, err)
		}
	}
	return nil
}

func scanFaces(rows pgx.Rows) ([]*FaceCluster, error) {
	var faces []*FaceCluster
	for rows.Next() {
		var fc FaceCluster
		var bboxJSON []byte
		if err := rows.Scan(
			&fc.ID, &fc.WorkspaceID, &fc.AssetID, &fc.GalleryID, &fc.FaceIndex,
			&bboxJSON, &fc.ClusterLabel, &fc.ClusterName, &fc.Confidence,
			&fc.Source, &fc.CreatedAt, &fc.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("face repo: scan: %w", err)
		}
		_ = json.Unmarshal(bboxJSON, &fc.BoundingBox)
		faces = append(faces, &fc)
	}
	return faces, rows.Err()
}
