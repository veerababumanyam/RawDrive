package ai

import (
	"context"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/storage"
)

// FaceService handles face detection, clustering, and management.
type FaceService struct {
	faceRepo   *FaceRepo
	jobRepo    *JobRepo
	configRepo *ConfigRepo
	spendRepo  *SpendRepo
	gemini     *GeminiClient
	store      storage.Provider
}

// NewFaceService creates a FaceService.
func NewFaceService(faceRepo *FaceRepo, jobRepo *JobRepo, configRepo *ConfigRepo, spendRepo *SpendRepo, gemini *GeminiClient, store storage.Provider) *FaceService {
	return &FaceService{
		faceRepo: faceRepo, jobRepo: jobRepo, configRepo: configRepo,
		spendRepo: spendRepo, gemini: gemini, store: store,
	}
}

// EnqueueDetection creates an async face detection job.
func (s *FaceService) EnqueueDetection(ctx context.Context, workspaceID uuid.UUID, assetIDs []uuid.UUID, galleryID *uuid.UUID) (*AIJob, error) {
	job := &AIJob{
		WorkspaceID: workspaceID,
		Type:        "face_detection",
		Status:      "pending",
		TotalItems:  len(assetIDs),
		Result:      map[string]any{"asset_ids": assetIDs},
	}
	if galleryID != nil {
		job.Result["gallery_id"] = galleryID.String()
	}

	if err := s.jobRepo.Create(ctx, job); err != nil {
		return nil, fmt.Errorf("face service: enqueue: %w", err)
	}
	return job, nil
}

// DetectAndStore performs face detection on a single asset.
func (s *FaceService) DetectAndStore(ctx context.Context, assetID, workspaceID uuid.UUID, galleryID *uuid.UUID) error {
	apiKey, model, err := s.configRepo.GetDecryptedKey(ctx, workspaceID)
	if err != nil {
		return err
	}

	// Read image from storage
	reader, err := s.store.Get(ctx, assetID.String())
	if err != nil {
		return fmt.Errorf("face service: get asset: %w", err)
	}
	defer reader.Close()

	imageData, err := readAll(reader)
	if err != nil {
		return fmt.Errorf("face service: read image: %w", err)
	}

	_ = model // using default model for face detection
	faces, inputTokens, outputTokens, err := s.gemini.DetectFaces(ctx, apiKey, imageData, "image/jpeg")
	if err != nil {
		return fmt.Errorf("face service: detect: %w", err)
	}

	// Log AI spend
	cost := EstimateCost(s.gemini.modelID, int64(inputTokens), int64(outputTokens))
	if err := s.spendRepo.LogUsage(ctx, &AIUsageLog{
		WorkspaceID:       workspaceID,
		Operation:         "face_detection",
		Model:             s.gemini.modelID,
		InputTokens:       int64(inputTokens),
		OutputTokens:      int64(outputTokens),
		CostEstimatePaisa: cost,
		AssetID:           &assetID,
	}); err != nil {
		log.Printf("face service: log spend failed: %v", err)
	}

	if len(faces) == 0 {
		return nil
	}

	// Store detected faces
	clusters := make([]*FaceCluster, len(faces))
	for i, f := range faces {
		clusters[i] = &FaceCluster{
			WorkspaceID: workspaceID,
			AssetID:     assetID,
			GalleryID:   galleryID,
			FaceIndex:   f.Index,
			BoundingBox: f.BoundingBox,
			Embedding:   f.Embedding,
			Confidence:  f.Confidence,
			Source:       "gemini",
		}
	}

	if err := s.faceRepo.StoreFaces(ctx, clusters); err != nil {
		return fmt.Errorf("face service: store faces: %w", err)
	}

	// Auto-cluster
	return s.ClusterFaces(ctx, clusters, workspaceID)
}

// ClusterFaces assigns cluster labels to newly detected faces using cosine similarity.
func (s *FaceService) ClusterFaces(ctx context.Context, faces []*FaceCluster, workspaceID uuid.UUID) error {
	for _, face := range faces {
		if len(face.Embedding) == 0 {
			continue
		}

		similar, err := s.faceRepo.FindSimilarFaces(ctx, face.Embedding, workspaceID, 0.85, 1)
		if err != nil {
			log.Printf("face service: find similar failed for face %s: %v", face.ID, err)
			continue
		}

		var label uuid.UUID
		var name string
		if len(similar) > 0 && similar[0].ClusterLabel != nil {
			label = *similar[0].ClusterLabel
			name = similar[0].ClusterName
		} else {
			label = uuid.New()
		}

		if err := s.faceRepo.UpdateClusterAssignment(ctx, face.ID, label, name); err != nil {
			log.Printf("face service: update cluster failed for face %s: %v", face.ID, err)
		}
	}
	return nil
}

// GetClusters returns cluster summaries for a workspace/gallery.
func (s *FaceService) GetClusters(ctx context.Context, workspaceID uuid.UUID, galleryID *uuid.UUID) ([]*ClusterSummary, error) {
	return s.faceRepo.ListClusters(ctx, workspaceID, galleryID)
}

// NameCluster assigns a name to a face cluster.
func (s *FaceService) NameCluster(ctx context.Context, workspaceID, clusterLabel uuid.UUID, name string) error {
	_, err := s.faceRepo.pool.Exec(ctx,
		`UPDATE face_clusters SET cluster_name = $3, updated_at = now()
		 WHERE workspace_id = $1 AND cluster_label = $2`,
		workspaceID, clusterLabel, name)
	return err
}

// MergeClusters merges source cluster into target.
func (s *FaceService) MergeClusters(ctx context.Context, workspaceID, srcLabel, dstLabel uuid.UUID) (int, error) {
	if srcLabel == dstLabel {
		return 0, ErrSameCluster
	}

	// Get target name to preserve it
	clusters, err := s.faceRepo.ListClusters(ctx, workspaceID, nil)
	if err != nil {
		return 0, err
	}

	dstName := ""
	for _, c := range clusters {
		if c.ClusterLabel == dstLabel {
			dstName = c.ClusterName
			break
		}
	}

	return s.faceRepo.MergeClusters(ctx, workspaceID, srcLabel, dstLabel, dstName)
}

// SplitCluster creates a new cluster from selected faces.
func (s *FaceService) SplitCluster(ctx context.Context, workspaceID uuid.UUID, faceIDs []uuid.UUID, newName string) (uuid.UUID, error) {
	if len(faceIDs) == 0 {
		return uuid.Nil, fmt.Errorf("face service: no faces to split")
	}

	newLabel := uuid.New()
	if err := s.faceRepo.SplitCluster(ctx, faceIDs, newLabel, newName); err != nil {
		return uuid.Nil, err
	}
	return newLabel, nil
}
