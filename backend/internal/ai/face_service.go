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
// Detection backend: DetectAndStore POSTs the image bytes to the face-svc
// Python sidecar (insightface buffalo_l, 512-d L2-normalized embeddings). The
// sidecar is required — the legacy Gemini Vision path (128-d) was removed once
// migration 110 widened face_clusters.embedding to vector(512), a dimension the
// 128-d Gemini vectors could never satisfy.
type FaceService struct {
	faceRepo   *FaceRepo
	jobRepo    *JobRepo
	store      storage.Provider
	faceClient *face.Client // required; the face-svc detection backend.
}

// NewFaceService creates a FaceService. The face-svc detection backend is
// required and is wired via WithFaceClient.
func NewFaceService(faceRepo *FaceRepo, jobRepo *JobRepo, store storage.Provider) *FaceService {
	return &FaceService{
		faceRepo: faceRepo, jobRepo: jobRepo, store: store,
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
// Detection runs on the required face-svc sidecar (insightface, 512-d). The
// legacy Gemini fallback was removed — it emitted 128-d vectors that are
// incompatible with the vector(512) column.
//
// Returns the number of faces detected and stored for the asset, so the worker
// can tally a job's faces without a separate per-asset GetFacesByAsset query.
func (s *FaceService) DetectAndStore(ctx context.Context, assetID, workspaceID uuid.UUID, galleryID *uuid.UUID) (int, error) {
	enabled, err := s.isFaceRecognitionEnabled(ctx, workspaceID)
	if err != nil {
		return 0, fmt.Errorf("face service: workspace gate check: %w", err)
	}
	if !enabled {
		log.Printf("face service: workspace %s has face_recognition_enabled=false; skipping asset %s", workspaceID, assetID)
		return 0, nil
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
		return 0, fmt.Errorf("face service: lookup storage_key: %w", err)
	}
	reader, err := s.store.Get(ctx, storageKey)
	if err != nil {
		return 0, fmt.Errorf("face service: get asset: %w", err)
	}
	defer reader.Close()

	imageData, err := readAll(reader)
	if err != nil {
		return 0, fmt.Errorf("face service: read image: %w", err)
	}

	if s.faceClient == nil {
		return 0, fmt.Errorf("face service: face-svc client not configured for asset %s", assetID)
	}
	// face-svc path. insightface buffalo_l: 512-d L2-normalized embeddings,
	// det_score ∈ [0,1], no per-request cost so spend logging is skipped.
	resp, err := s.faceClient.DetectAndEmbed(ctx, imageData, fmt.Sprintf("asset-%s.jpg", assetID))
	if err != nil {
		return 0, fmt.Errorf("face service: face-svc detect: %w", err)
	}
	if len(resp.Faces) == 0 {
		return 0, nil
	}
	clusters := make([]*FaceCluster, len(resp.Faces))
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

	if err := s.faceRepo.StoreFaces(ctx, clusters); err != nil {
		return 0, fmt.Errorf("face service: store faces: %w", err)
	}

	// Auto-cluster the freshly-stored faces.
	return len(clusters), s.ClusterFaces(ctx, clusters, workspaceID)
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

// IsFaceRecognitionEnabled is the exported view of the workspace biometric
// opt-in gate (workspaces.face_recognition_enabled, migration 110). The
// client-face-index ingest handler (epic slice 1) uses it to refuse storing
// biometric embeddings for a workspace that hasn't opted in (DPDP/GDPR).
func (s *FaceService) IsFaceRecognitionEnabled(ctx context.Context, workspaceID uuid.UUID) (bool, error) {
	return s.isFaceRecognitionEnabled(ctx, workspaceID)
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

// FaceSearchResult is the outcome of SearchByFace — a "find me in this
// gallery" lookup keyed by an ad-hoc image (typically a webcam capture).
//
//   - Found=false + FacesDetected=0   → the input image has no face
//   - Found=false + FacesDetected>0   → face(s) detected but none match
//     an existing cluster in the workspace above the similarity floor
//   - Found=true                       → ClusterLabel/Name identify the
//     matched person; AssetIDs are the photos in this gallery that
//     contain that cluster
type FaceSearchResult struct {
	Found         bool
	ClusterLabel  *uuid.UUID
	ClusterName   string
	Similarity    float64
	AssetIDs      []uuid.UUID
	FacesDetected int
}

// SearchByFace runs face-svc detection on an ad-hoc image (the camera
// capture from the dashboard "Photo Search" view), picks the
// highest-confidence face, finds the nearest existing cluster in the
// workspace via pgvector cosine, then returns the cluster's photos
// scoped to the supplied gallery.
//
// Why two-stage (workspace match → gallery scope): clustering identity
// is workspace-wide so we benefit from every previously-clustered photo
// of this person. Then we gallery-scope the result set so the search
// page stays inside the gallery the user is currently looking at —
// matching the People-tab click-through behavior fixed in d184f9d.
//
// Decision algorithm (2026-05-18 v2):
//
//	The original implementation took top-1 nearest neighbour at
//	threshold 0.50. That misses everyone whose webcam shot doesn't
//	closely resemble any single studio photo in the workspace —
//	exactly the "camera angle, lighting, resolution all differ from
//	the wedding photo" failure the user reported. The fix has three
//	parts:
//
//	1. Lower the retrieval floor to 0.30 — well below where false
//	   positives kick in (different people typically sit < 0.25 with
//	   ArcFace r100 L2-normalized embeddings), but high enough that
//	   noise faces don't flood the candidate pool. Webcam captures
//	   of the same person against studio photos commonly land in the
//	   0.35-0.55 band.
//	2. Pull top-K=20 candidates instead of 1, so a single ambiguous
//	   nearest neighbour can't drive the decision.
//	3. Vote by cluster_label. The winning cluster is the one with the
//	   highest aggregate score (sum of similarities across all faces
//	   returned for that cluster). A person who appears in many gallery
//	   photos will accumulate score from each of them; a stranger's
//	   one-off similar face won't.
//
//	Match acceptance floor: the winning cluster's BEST individual
//	similarity must be ≥ 0.40, OR its aggregate score (sum) must be
//	≥ 0.80. This is the "is anyone here?" gate — without it a noisy
//	candidate at 0.31 could win simply by being the only one above
//	0.30.
func (s *FaceService) SearchByFace(ctx context.Context, workspaceID, galleryID uuid.UUID, imageData []byte) (*FaceSearchResult, error) {
	if s.faceClient == nil {
		return nil, fmt.Errorf("face service: face-svc not configured (FACE_SVC_URL unset)")
	}

	enabled, err := s.isFaceRecognitionEnabled(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("face service: workspace gate check: %w", err)
	}
	if !enabled {
		return nil, fmt.Errorf("face service: face recognition disabled for this workspace")
	}

	resp, err := s.faceClient.DetectAndEmbed(ctx, imageData, "search.jpg")
	if err != nil {
		return nil, fmt.Errorf("face service: detect search face: %w", err)
	}
	if len(resp.Faces) == 0 {
		return &FaceSearchResult{Found: false, FacesDetected: 0}, nil
	}

	// Pick the most confident detection. Camera captures may include
	// background bystanders at much lower det_score — taking the max
	// favors the foreground subject.
	best := resp.Faces[0]
	for i := range resp.Faces[1:] {
		f := resp.Faces[i+1]
		if f.DetScore > best.DetScore {
			best = f
		}
	}

	const (
		retrievalThreshold = 0.30
		retrievalLimit     = 20
		minBestSimilarity  = 0.40
		minAggregateScore  = 0.80
	)

	matches, err := s.faceRepo.FindSimilarFacesScored(ctx, best.Embedding, workspaceID, retrievalThreshold, retrievalLimit)
	if err != nil {
		return nil, fmt.Errorf("face service: find similar: %w", err)
	}
	if len(matches) == 0 {
		log.Printf("face search: workspace=%s ws_face_count=0 candidates above %.2f; faces_detected=%d",
			workspaceID, retrievalThreshold, len(resp.Faces))
		return &FaceSearchResult{Found: false, FacesDetected: len(resp.Faces)}, nil
	}

	// Cluster vote. Group candidates by cluster_label, track best
	// per-cluster similarity and aggregate score. Aggregate (sum)
	// rewards clusters with multiple close matches; best individual
	// captures the "any single strong hit is convincing on its own"
	// case (e.g., the gallery has one studio portrait of the person).
	type clusterAgg struct {
		label     uuid.UUID
		name      string
		bestSim   float64
		aggregate float64
		hits      int
	}
	aggByLabel := make(map[uuid.UUID]*clusterAgg, 8)
	for _, m := range matches {
		if m.Face.ClusterLabel == nil {
			continue
		}
		k := *m.Face.ClusterLabel
		a, ok := aggByLabel[k]
		if !ok {
			a = &clusterAgg{label: k, name: m.Face.ClusterName}
			aggByLabel[k] = a
		}
		// Keep first non-empty name encountered; cluster_name should
		// be uniform across rows but a freshly renamed cluster might
		// briefly disagree if the search races a rename.
		if a.name == "" && m.Face.ClusterName != "" {
			a.name = m.Face.ClusterName
		}
		if m.Similarity > a.bestSim {
			a.bestSim = m.Similarity
		}
		a.aggregate += m.Similarity
		a.hits++
	}

	var winner *clusterAgg
	for _, a := range aggByLabel {
		if winner == nil || a.aggregate > winner.aggregate {
			winner = a
		}
	}

	log.Printf("face search: workspace=%s gallery=%s candidates=%d clusters=%d winner=%v winner_best=%.3f winner_agg=%.3f winner_hits=%d",
		workspaceID, galleryID, len(matches), len(aggByLabel),
		func() string {
			if winner != nil {
				return winner.label.String()
			}
			return "nil"
		}(),
		func() float64 {
			if winner != nil {
				return winner.bestSim
			}
			return 0
		}(),
		func() float64 {
			if winner != nil {
				return winner.aggregate
			}
			return 0
		}(),
		func() int {
			if winner != nil {
				return winner.hits
			}
			return 0
		}(),
	)

	if winner == nil || (winner.bestSim < minBestSimilarity && winner.aggregate < minAggregateScore) {
		return &FaceSearchResult{Found: false, FacesDetected: len(resp.Faces)}, nil
	}

	matchedLabel := winner.label
	assetIDs, err := s.faceRepo.ListClusterAssetIDsInGallery(ctx, galleryID, matchedLabel)
	if err != nil {
		return nil, fmt.Errorf("face service: list cluster assets in gallery: %w", err)
	}

	return &FaceSearchResult{
		Found:         true,
		ClusterLabel:  &matchedLabel,
		ClusterName:   winner.name,
		Similarity:    winner.bestSim,
		AssetIDs:      assetIDs,
		FacesDetected: len(resp.Faces),
	}, nil
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
