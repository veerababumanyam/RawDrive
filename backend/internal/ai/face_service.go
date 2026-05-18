package ai

import (
	"context"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/face"
	"github.com/rawdrive/backend/internal/storage"
)

// FaceService handles face detection, clustering, and management.
//
// Detection backend (2026-05-18, PR-2a):
//   - If faceClient is wired (FACE_SVC_URL set), DetectAndStore POSTs to the
//     face-svc Python sidecar (insightface buffalo_l, 512-d embeddings).
//   - Else it falls back to the original Gemini Vision path (128-d). Note:
//     migration 110 widened face_clusters.embedding to vector(512), so the
//     Gemini fallback now fails-fast on insert — keep it only as a stub
//     until the Gemini path is ripped out in a follow-up cleanup.
type FaceService struct {
	faceRepo   *FaceRepo
	jobRepo    *JobRepo
	configRepo *ConfigRepo
	spendRepo  *SpendRepo
	gemini     *GeminiClient
	store      storage.Provider
	faceClient *face.Client // optional; preferred detection backend when non-nil.
}

// NewFaceService creates a FaceService. Wire the face-svc backend with
// WithFaceClient — the constructor stays backward-compatible so existing
// call sites in main.go continue to compile during the migration.
func NewFaceService(faceRepo *FaceRepo, jobRepo *JobRepo, configRepo *ConfigRepo, spendRepo *SpendRepo, gemini *GeminiClient, store storage.Provider) *FaceService {
	return &FaceService{
		faceRepo: faceRepo, jobRepo: jobRepo, configRepo: configRepo,
		spendRepo: spendRepo, gemini: gemini, store: store,
	}
}

// WithFaceClient enables the face-svc detection backend. Returns the
// receiver so wiring stays chainable in main.go.
func (s *FaceService) WithFaceClient(c *face.Client) *FaceService {
	s.faceClient = c
	return s
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
//
// Workspace gate: face recognition processes biometric data, gated on the
// workspace's face_recognition_enabled flag (migration 110, DEFAULT FALSE).
// A disabled workspace returns nil — the worker treats this as a clean skip
// so jobs don't pile up in the failed state.
//
// Backend selection: when faceClient is wired we use the face-svc sidecar
// (insightface, 512-d); otherwise we fall back to the legacy Gemini path,
// which is now effectively bricked because face_clusters.embedding is
// vector(512) and Gemini emits 128-d.
func (s *FaceService) DetectAndStore(ctx context.Context, assetID, workspaceID uuid.UUID, galleryID *uuid.UUID) error {
	enabled, err := s.isFaceRecognitionEnabled(ctx, workspaceID)
	if err != nil {
		return fmt.Errorf("face service: workspace gate check: %w", err)
	}
	if !enabled {
		log.Printf("face service: workspace %s has face_recognition_enabled=false; skipping asset %s", workspaceID, assetID)
		return nil
	}

	// Read image from storage. We MUST use the asset's storage_key, not
	// its UUID — the storage layout is
	// <workspace_id>/<some-uuid>/original.<ext> and using the asset id
	// directly returns NoSuchKey 404 every time. This was a pre-existing
	// bug in the Gemini fallback path that never triggered because the
	// Gemini detection was never activated; surfaced once the face-svc
	// path went live in PR-2a.
	var storageKey string
	if err := s.faceRepo.pool.QueryRow(ctx,
		`SELECT storage_key FROM assets WHERE id = $1 AND deleted_at IS NULL`,
		assetID,
	).Scan(&storageKey); err != nil {
		return fmt.Errorf("face service: lookup storage_key: %w", err)
	}
	reader, err := s.store.Get(ctx, storageKey)
	if err != nil {
		return fmt.Errorf("face service: get asset: %w", err)
	}
	defer reader.Close()

	imageData, err := readAll(reader)
	if err != nil {
		return fmt.Errorf("face service: read image: %w", err)
	}

	var clusters []*FaceCluster

	if s.faceClient != nil {
		// face-svc path (preferred). insightface buffalo_l: 512-d L2-normalized
		// embeddings, det_score ∈ [0,1], no per-request cost so spend logging
		// is intentionally skipped.
		resp, err := s.faceClient.DetectAndEmbed(ctx, imageData, fmt.Sprintf("asset-%s.jpg", assetID))
		if err != nil {
			return fmt.Errorf("face service: face-svc detect: %w", err)
		}
		if len(resp.Faces) == 0 {
			return nil
		}
		clusters = make([]*FaceCluster, len(resp.Faces))
		for i, f := range resp.Faces {
			clusters[i] = &FaceCluster{
				WorkspaceID: workspaceID,
				AssetID:     assetID,
				GalleryID:   galleryID,
				FaceIndex:   i,
				BoundingBox: BoundingBox{
					X: float64(f.Bbox.X),
					Y: float64(f.Bbox.Y),
					W: float64(f.Bbox.W),
					H: float64(f.Bbox.H),
				},
				Embedding:  f.Embedding,
				Confidence: float64(f.DetScore),
				Source:     "insightface",
			}
		}
	} else {
		// Legacy Gemini fallback. Kept as a code path during the migration so
		// the wider AI handler wiring doesn't have to change in lockstep,
		// but inserts will fail at the pgvector dimension check until this
		// is removed.
		apiKey, _, err := s.configRepo.GetDecryptedKey(ctx, workspaceID)
		if err != nil {
			return err
		}
		faces, inputTokens, outputTokens, err := s.gemini.DetectFaces(ctx, apiKey, imageData, "image/jpeg")
		if err != nil {
			return fmt.Errorf("face service: gemini detect: %w", err)
		}
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
		clusters = make([]*FaceCluster, len(faces))
		for i, f := range faces {
			clusters[i] = &FaceCluster{
				WorkspaceID: workspaceID,
				AssetID:     assetID,
				GalleryID:   galleryID,
				FaceIndex:   f.Index,
				BoundingBox: f.BoundingBox,
				Embedding:   f.Embedding,
				Confidence:  f.Confidence,
				Source:      "gemini",
			}
		}
	}

	if err := s.faceRepo.StoreFaces(ctx, clusters); err != nil {
		return fmt.Errorf("face service: store faces: %w", err)
	}

	// Auto-cluster the freshly-stored faces.
	return s.ClusterFaces(ctx, clusters, workspaceID)
}

// isFaceRecognitionEnabled reads workspaces.face_recognition_enabled (migration
// 110). DEFAULT FALSE — biometric data processing is opt-in under DPDP/GDPR.
func (s *FaceService) isFaceRecognitionEnabled(ctx context.Context, workspaceID uuid.UUID) (bool, error) {
	var enabled bool
	err := s.faceRepo.pool.QueryRow(ctx,
		`SELECT face_recognition_enabled FROM workspaces WHERE id = $1`,
		workspaceID,
	).Scan(&enabled)
	if err != nil {
		return false, err
	}
	return enabled, nil
}

// ClusterFaces assigns cluster labels to newly detected faces using cosine similarity.
func (s *FaceService) ClusterFaces(ctx context.Context, faces []*FaceCluster, workspaceID uuid.UUID) error {
	for _, face := range faces {
		if len(face.Embedding) == 0 {
			continue
		}

		// 2026-05-18: lowered from 0.85 → 0.55. The 0.85 threshold was tuned
		// for Gemini's 128-d embeddings where same-person similarity is
		// tighter; with insightface ArcFace r100 (512-d L2-normalized) the
		// same-person cosine similarity range is typically 0.4-0.7 across
		// different poses/lighting and 0.85 only matches near-identical
		// frames. Result was every photo of the same person getting its
		// own cluster_label — visible in the People tab as duplicate
		// "Unnamed person" tiles for the same face. 0.55 is the standard
		// recognition operating point for buffalo_l in production setups;
		// raise toward 0.6 if false-positive merges become a problem,
		// lower toward 0.5 if same-person clusters still split.
		similar, err := s.faceRepo.FindSimilarFaces(ctx, face.Embedding, workspaceID, 0.55, 1)
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

// FilterByCluster returns distinct asset IDs that match a face cluster
// (M3 E8-S3 FaceID filter). The caller uses these IDs to further filter
// gallery listings or to populate a smart album.
func (s *FaceService) FilterByCluster(ctx context.Context, workspaceID, clusterLabel uuid.UUID) ([]uuid.UUID, error) {
	return s.faceRepo.ListClusterAssetIDs(ctx, workspaceID, clusterLabel)
}

// FilterByClusterInGallery is the gallery-scoped variant — see
// face_repo.ListClusterAssetIDsInGallery for the join-through-
// gallery_assets rationale. Used by the dashboard People-tab person
// view so a click on a face stays inside the current gallery rather
// than enumerating every gallery in the workspace that contains the
// same person.
func (s *FaceService) FilterByClusterInGallery(ctx context.Context, galleryID, clusterLabel uuid.UUID) ([]uuid.UUID, error) {
	return s.faceRepo.ListClusterAssetIDsInGallery(ctx, galleryID, clusterLabel)
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
