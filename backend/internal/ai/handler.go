package ai

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/ctxkeys"
)

// AlbumCreator is the narrow surface the AI handler needs to create a
// smart album from a face cluster. Implemented by *service.AlbumService;
// tests use a fake. Keeping it as an interface here avoids an ai → service
// import cycle.
type AlbumCreator interface {
	CreateSmartAlbum(ctx context.Context, galleryID uuid.UUID, name string, smartFilter map[string]any) (uuid.UUID, error)
}

// Handler handles all /api/v1/ai/* HTTP routes.
type Handler struct {
	faceSvc      *FaceService
	searchSvc    *SearchService
	duplicateSvc *DuplicateService
	cullingSvc   *CullingService
	configRepo   *ConfigRepo
	spendRepo    *SpendRepo
	jobRepo      *JobRepo
	albumCreator AlbumCreator // optional — only the face smart-album endpoint uses this
}

// WithAlbumCreator wires in a smart-album creator for the face cluster
// → smart album endpoint. Returns the handler for fluent chaining.
func (h *Handler) WithAlbumCreator(ac AlbumCreator) *Handler {
	h.albumCreator = ac
	return h
}

// NewHandler creates an AI handler with all service dependencies.
func NewHandler(faceSvc *FaceService, searchSvc *SearchService, duplicateSvc *DuplicateService, cullingSvc *CullingService, configRepo *ConfigRepo, spendRepo *SpendRepo, jobRepo *JobRepo) *Handler {
	return &Handler{
		faceSvc: faceSvc, searchSvc: searchSvc, duplicateSvc: duplicateSvc,
		cullingSvc: cullingSvc, configRepo: configRepo, spendRepo: spendRepo, jobRepo: jobRepo,
	}
}

// ---- Face Detection Endpoints ----

// TriggerFaceDetect handles POST /api/v1/ai/face-detect.
func (h *Handler) TriggerFaceDetect(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)
	if wsID == uuid.Nil {
		respondError(w, http.StatusBadRequest, "workspace_id required")
		return
	}

	var req FaceDetectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.AssetIDs) == 0 || len(req.AssetIDs) > 100 {
		respondError(w, http.StatusBadRequest, "asset_ids required (1-100)")
		return
	}

	job, err := h.faceSvc.EnqueueDetection(r.Context(), wsID, req.AssetIDs, req.GalleryID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusAccepted, FaceDetectResponse{JobID: job.ID, Status: job.Status})
}

// ListClusters handles GET /api/v1/ai/clusters.
func (h *Handler) ListClusters(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)

	var galleryID *uuid.UUID
	if gid := r.URL.Query().Get("gallery_id"); gid != "" {
		parsed, err := uuid.Parse(gid)
		if err != nil {
			respondError(w, http.StatusBadRequest, "invalid gallery_id")
			return
		}
		galleryID = &parsed
	}

	clusters, err := h.faceSvc.GetClusters(r.Context(), wsID, galleryID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if clusters == nil {
		clusters = []*ClusterSummary{}
	}
	respondJSON(w, http.StatusOK, clusters)
}

// UpdateCluster handles PATCH /api/v1/ai/clusters/{id}.
func (h *Handler) UpdateCluster(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)
	clusterID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid cluster id")
		return
	}

	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
		respondError(w, http.StatusBadRequest, "name required")
		return
	}

	if err := h.faceSvc.NameCluster(r.Context(), wsID, clusterID, body.Name); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// MergeClusters handles POST /api/v1/ai/clusters/merge.
func (h *Handler) MergeClusters(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)

	var body struct {
		SourceClusterID uuid.UUID `json:"source_cluster_id"`
		TargetClusterID uuid.UUID `json:"target_cluster_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	merged, err := h.faceSvc.MergeClusters(r.Context(), wsID, body.SourceClusterID, body.TargetClusterID)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"merged_count": merged})
}

// SplitCluster handles POST /api/v1/ai/clusters/{id}/split.
func (h *Handler) SplitCluster(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)
	_ = wsID

	var body struct {
		FaceIDs        []uuid.UUID `json:"face_ids"`
		NewClusterName string      `json:"new_cluster_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.FaceIDs) == 0 {
		respondError(w, http.StatusBadRequest, "face_ids required")
		return
	}

	newLabel, err := h.faceSvc.SplitCluster(r.Context(), wsID, body.FaceIDs, body.NewClusterName)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"new_cluster_label": newLabel})
}

// GetClusterAssets handles GET /api/v1/ai/clusters/{id}/assets (M3 E8-S3).
// Returns distinct asset IDs in a face cluster, scoped to the caller's
// workspace. Frontend FaceFilter component calls this to render a
// filtered gallery view.
func (h *Handler) GetClusterAssets(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)
	if wsID == uuid.Nil {
		respondError(w, http.StatusBadRequest, "workspace_id required")
		return
	}
	clusterID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid cluster id")
		return
	}

	assetIDs, err := h.faceSvc.FilterByCluster(r.Context(), wsID, clusterID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if assetIDs == nil {
		assetIDs = []uuid.UUID{}
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"cluster_label": clusterID,
		"asset_ids":     assetIDs,
		"count":         len(assetIDs),
	})
}

// CreateClusterSmartAlbum handles POST /api/v1/ai/clusters/{id}/create-album
// (M3 E8-S3 smart album from face). Creates a gallery-scoped smart album
// whose smart_filter resolves to all assets containing the given face
// cluster. Body: {"gallery_id": "...", "name": "Optional override"}.
func (h *Handler) CreateClusterSmartAlbum(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)
	if wsID == uuid.Nil {
		respondError(w, http.StatusBadRequest, "workspace_id required")
		return
	}
	if h.albumCreator == nil {
		respondError(w, http.StatusServiceUnavailable, "album creator not wired")
		return
	}
	clusterID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid cluster id")
		return
	}

	var body struct {
		GalleryID uuid.UUID `json:"gallery_id"`
		Name      string    `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.GalleryID == uuid.Nil {
		respondError(w, http.StatusBadRequest, "gallery_id required")
		return
	}

	name := body.Name
	if name == "" {
		// Fall back to the cluster's stored name if we can look it up,
		// otherwise a short tag of the cluster UUID.
		clusters, lerr := h.faceSvc.GetClusters(r.Context(), wsID, &body.GalleryID)
		if lerr == nil {
			for _, c := range clusters {
				if c.ClusterLabel == clusterID && c.ClusterName != "" {
					name = "Face: " + c.ClusterName
					break
				}
			}
		}
		if name == "" {
			name = "Face: " + clusterID.String()[:8]
		}
	}

	smartFilter := map[string]any{
		"face_cluster_label": clusterID.String(),
	}

	albumID, err := h.albumCreator.CreateSmartAlbum(r.Context(), body.GalleryID, name, smartFilter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, map[string]any{
		"album_id":      albumID,
		"name":          name,
		"cluster_label": clusterID,
		"gallery_id":    body.GalleryID,
	})
}

// ---- Search & Tagging Endpoints ----

// SemanticSearch handles POST /api/v1/ai/search.
func (h *Handler) SemanticSearch(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)

	var req SemanticSearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Query == "" {
		respondError(w, http.StatusBadRequest, "query required")
		return
	}

	results, err := h.searchSvc.SemanticSearch(r.Context(), wsID, req.Query, req.GalleryID, req.Limit)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if results == nil {
		results = []SearchResult{}
	}
	respondJSON(w, http.StatusOK, map[string]any{"results": results, "total": len(results)})
}

// TriggerTags handles POST /api/v1/ai/tags.
func (h *Handler) TriggerTags(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)
	_ = wsID

	var req TagTriggerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.AssetIDs) == 0 {
		respondError(w, http.StatusBadRequest, "asset_ids required")
		return
	}
	if len(req.AssetIDs) > 50 {
		respondError(w, http.StatusBadRequest, "max 50 asset_ids per request")
		return
	}

	respondJSON(w, http.StatusAccepted, map[string]any{"queued": len(req.AssetIDs)})
}

// GetTags handles GET /api/v1/ai/tags/{assetId}.
func (h *Handler) GetTags(w http.ResponseWriter, r *http.Request) {
	assetID, err := uuid.Parse(chi.URLParam(r, "assetId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid asset_id")
		return
	}

	tags, caption, status, err := h.searchSvc.GetTags(r.Context(), assetID)
	if err != nil {
		respondError(w, http.StatusNotFound, "asset not found")
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"asset_id":      assetID,
		"ai_tags":       tags,
		"ai_caption":    caption,
		"ai_tag_status": status,
	})
}

// EditTags handles PATCH /api/v1/ai/tags/{assetId}.
func (h *Handler) EditTags(w http.ResponseWriter, r *http.Request) {
	assetID, err := uuid.Parse(chi.URLParam(r, "assetId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid asset_id")
		return
	}

	var req TagEditRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Patches) == 0 {
		respondError(w, http.StatusBadRequest, "patches required")
		return
	}

	if err := h.searchSvc.EditTags(r.Context(), assetID, req.Patches); err != nil {
		respondError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// ---- BYOK Config Endpoints ----

// SaveConfig handles POST /api/v1/ai/config.
func (h *Handler) SaveConfig(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)

	var req ConfigSaveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.APIKey == "" {
		respondError(w, http.StatusBadRequest, "api_key required")
		return
	}

	if err := h.configRepo.Save(r.Context(), wsID, "gemini", req.APIKey, req.ModelPreference); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, map[string]string{"status": "saved", "provider": "gemini"})
}

// GetConfig handles GET /api/v1/ai/config.
func (h *Handler) GetConfig(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)

	cfg, err := h.configRepo.GetByWorkspace(r.Context(), wsID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if cfg == nil {
		respondJSON(w, http.StatusOK, map[string]any{"configured": false})
		return
	}

	// Decrypt and mask key for display
	key, _, _ := h.configRepo.GetDecryptedKey(r.Context(), wsID)
	masked := MaskKey(key)

	respondJSON(w, http.StatusOK, map[string]any{
		"configured":       true,
		"provider":         cfg.Provider,
		"model_preference": cfg.ModelPreference,
		"key_masked":       masked,
		"enabled":          cfg.Enabled,
	})
}

// DeleteConfig handles DELETE /api/v1/ai/config.
func (h *Handler) DeleteConfig(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)
	if err := h.configRepo.Delete(r.Context(), wsID); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ValidateKey handles POST /api/v1/ai/config/validate.
func (h *Handler) ValidateKey(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)

	key, _, err := h.configRepo.GetDecryptedKey(r.Context(), wsID)
	if err != nil {
		respondJSON(w, http.StatusOK, map[string]any{"valid": false, "error": "no key configured"})
		return
	}

	if err := h.faceSvc.gemini.ValidateKey(r.Context(), key); err != nil {
		respondJSON(w, http.StatusOK, map[string]any{"valid": false, "error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"valid": true})
}

// ---- Duplicate & Culling Endpoints ----

// ScanDuplicates handles POST /api/v1/ai/duplicates/scan.
func (h *Handler) ScanDuplicates(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)

	var body struct {
		GalleryID *uuid.UUID `json:"gallery_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	job, err := h.duplicateSvc.ScanForDuplicates(r.Context(), wsID, body.GalleryID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusAccepted, FaceDetectResponse{JobID: job.ID, Status: job.Status})
}

// ListDuplicates handles GET /api/v1/ai/duplicates.
func (h *Handler) ListDuplicates(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)
	status := r.URL.Query().Get("status")

	groups, err := h.duplicateSvc.ListDuplicateGroups(r.Context(), wsID, status, 20, 0)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if groups == nil {
		groups = []DuplicateGroup{}
	}
	respondJSON(w, http.StatusOK, map[string]any{"groups": groups, "total": len(groups)})
}

// GetDuplicateGroup handles GET /api/v1/ai/duplicates/{id}.
func (h *Handler) GetDuplicateGroup(w http.ResponseWriter, r *http.Request) {
	groupID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid group id")
		return
	}

	group, err := h.duplicateSvc.GetDuplicateGroup(r.Context(), groupID)
	if err != nil {
		respondError(w, http.StatusNotFound, "group not found")
		return
	}

	respondJSON(w, http.StatusOK, group)
}

// ResolveDuplicate handles POST /api/v1/ai/duplicates/{id}/resolve.
func (h *Handler) ResolveDuplicate(w http.ResponseWriter, r *http.Request) {
	groupID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid group id")
		return
	}

	if err := h.duplicateSvc.ResolveDuplicateGroup(r.Context(), groupID); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "resolved"})
}

// DismissDuplicate handles POST /api/v1/ai/duplicates/{id}/dismiss.
func (h *Handler) DismissDuplicate(w http.ResponseWriter, r *http.Request) {
	groupID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid group id")
		return
	}

	if err := h.duplicateSvc.DismissDuplicateGroup(r.Context(), groupID); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "dismissed"})
}

// ---- Spend Endpoints ----

// GetSpend handles GET /api/v1/ai/spend.
func (h *Handler) GetSpend(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)

	summary, err := h.spendRepo.GetMonthlySummary(r.Context(), wsID, timeNow())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, summary)
}

// SetSpendCap handles PUT /api/v1/ai/spend/cap.
func (h *Handler) SetSpendCap(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)

	var req SpendCapRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MonthlyCapPaisa < 0 {
		respondError(w, http.StatusBadRequest, "monthly_cap_paisa must be >= 0")
		return
	}

	if err := h.configRepo.UpsertCap(r.Context(), wsID, req.MonthlyCapPaisa); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"workspace_id": wsID, "monthly_cap_paisa": req.MonthlyCapPaisa})
}

// GetCredits handles GET /api/v1/ai/credits.
func (h *Handler) GetCredits(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)

	cfg, err := h.configRepo.GetByWorkspace(r.Context(), wsID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	summary, err := h.spendRepo.GetMonthlySummary(r.Context(), wsID, timeNow())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	credit := CreditSummary{
		WorkspaceID:         wsID,
		SpentThisMonthPaisa: summary.TotalPaisa,
		RemainingPaisa:      -1,
	}

	if cfg != nil {
		credit.MonthlyCapPaisa = cfg.MonthlyCapPaisa
		credit.Alert80Sent = cfg.Alert80Sent
		credit.Alert100Sent = cfg.Alert100Sent
		if cfg.MonthlyCapPaisa > 0 {
			credit.RemainingPaisa = cfg.MonthlyCapPaisa - summary.TotalPaisa
			if credit.RemainingPaisa < 0 {
				credit.RemainingPaisa = 0
			}
			credit.CapUsedPercent = float64(summary.TotalPaisa) * 100 / float64(cfg.MonthlyCapPaisa)
			credit.IsCapReached = summary.TotalPaisa >= cfg.MonthlyCapPaisa
		}
	}

	respondJSON(w, http.StatusOK, credit)
}

// ---- Job Endpoint ----

// GetJob handles GET /api/v1/ai/jobs/{id}.
func (h *Handler) GetJob(w http.ResponseWriter, r *http.Request) {
	jobID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid job id")
		return
	}

	job, err := h.jobRepo.GetByID(r.Context(), jobID)
	if err != nil || job == nil {
		respondError(w, http.StatusNotFound, "job not found")
		return
	}

	respondJSON(w, http.StatusOK, job)
}

// ---- Culling Endpoints ----

// TriggerCulling handles POST /api/v1/ai/cull.
func (h *Handler) TriggerCulling(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)

	var body struct {
		GalleryID  uuid.UUID `json:"gallery_id"`
		TopPercent int       `json:"top_percent"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.GalleryID == uuid.Nil {
		respondError(w, http.StatusBadRequest, "gallery_id required")
		return
	}
	if body.TopPercent <= 0 || body.TopPercent > 100 {
		body.TopPercent = 20
	}

	job, err := h.cullingSvc.AnalyzeGallery(r.Context(), wsID, body.GalleryID, body.TopPercent)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusAccepted, FaceDetectResponse{JobID: job.ID, Status: job.Status})
}

// GetCullingSuggestions handles GET /api/v1/ai/cull/{jobId}.
func (h *Handler) GetCullingSuggestions(w http.ResponseWriter, r *http.Request) {
	jobID, err := uuid.Parse(chi.URLParam(r, "jobId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid job id")
		return
	}

	suggestions, err := h.cullingSvc.GetSuggestions(r.Context(), jobID)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"suggestions": suggestions, "total": len(suggestions)})
}

// ---- FR-012: Aesthetic Scoring ----

func (h *Handler) TriggerAestheticScore(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)
	if wsID == uuid.Nil {
		respondError(w, http.StatusBadRequest, "workspace_id required")
		return
	}
	var req struct {
		AssetIDs []uuid.UUID `json:"asset_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.AssetIDs) == 0 {
		respondError(w, http.StatusBadRequest, "asset_ids required (1-50)")
		return
	}
	if len(req.AssetIDs) > 50 {
		respondError(w, http.StatusBadRequest, "max 50 asset_ids per request")
		return
	}
	job := &AIJob{WorkspaceID: wsID, Type: "aesthetic_scoring", Status: "pending", TotalItems: len(req.AssetIDs), Result: map[string]any{"asset_ids": req.AssetIDs}}
	if err := h.jobRepo.Create(r.Context(), job); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusAccepted, map[string]any{"job_id": job.ID, "status": job.Status, "queued": len(req.AssetIDs)})
}

func (h *Handler) GetAestheticScore(w http.ResponseWriter, r *http.Request) {
	assetID, err := uuid.Parse(chi.URLParam(r, "assetId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid asset_id")
		return
	}
	wsID := getWorkspaceID(r)
	var score QualityScore
	err = h.cullingSvc.pool.QueryRow(r.Context(),
		`SELECT sharpness, exposure, composition, overall FROM quality_scores WHERE asset_id = $1 AND workspace_id = $2`,
		assetID, wsID).Scan(&score.Sharpness, &score.Exposure, &score.Composition, &score.Overall)
	if err != nil {
		respondError(w, http.StatusNotFound, "no aesthetic score found for this asset")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"asset_id": assetID, "score": score})
}

// ---- FR-013: Burst Grouping ----

func (h *Handler) TriggerBurstGrouping(w http.ResponseWriter, r *http.Request) {
	wsID := getWorkspaceID(r)
	if wsID == uuid.Nil {
		respondError(w, http.StatusBadRequest, "workspace_id required")
		return
	}
	var body struct {
		GalleryID     uuid.UUID `json:"gallery_id"`
		TimeWindowSec int       `json:"time_window_sec"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.GalleryID == uuid.Nil {
		respondError(w, http.StatusBadRequest, "gallery_id required")
		return
	}
	if body.TimeWindowSec <= 0 {
		body.TimeWindowSec = 3
	}
	job := &AIJob{WorkspaceID: wsID, Type: "burst_grouping", Status: "pending", Result: map[string]any{"gallery_id": body.GalleryID.String(), "time_window_sec": body.TimeWindowSec}}
	if err := h.jobRepo.Create(r.Context(), job); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusAccepted, map[string]any{"job_id": job.ID, "status": job.Status})
}

func (h *Handler) ListBurstGroups(w http.ResponseWriter, r *http.Request) {
	galleryIDStr := r.URL.Query().Get("gallery_id")
	galleryID, err := uuid.Parse(galleryIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "gallery_id required")
		return
	}
	rows, err := h.cullingSvc.pool.Query(r.Context(),
		`SELECT bg.id, bg.name, bg.asset_count, bg.best_pick_id
		 FROM burst_groups bg WHERE bg.gallery_id = $1 ORDER BY bg.created_at ASC`, galleryID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	type BurstGroupResp struct {
		ID         uuid.UUID  `json:"id"`
		Name       *string    `json:"name"`
		AssetCount int        `json:"asset_count"`
		BestPickID *uuid.UUID `json:"best_pick_id"`
	}
	var groups []BurstGroupResp
	for rows.Next() {
		var g BurstGroupResp
		if err := rows.Scan(&g.ID, &g.Name, &g.AssetCount, &g.BestPickID); err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		groups = append(groups, g)
	}
	if groups == nil {
		groups = []BurstGroupResp{}
	}
	respondJSON(w, http.StatusOK, map[string]any{"groups": groups, "total": len(groups)})
}

// ---- Helpers ----

func respondJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, msg string) {
	respondJSON(w, status, map[string]string{"error": msg})
}

// getWorkspaceID extracts the workspace ID from request context.
// Uses the typed ctxkeys.WorkspaceID key shared with middleware.
func getWorkspaceID(r *http.Request) uuid.UUID {
	val := r.Context().Value(ctxkeys.WorkspaceID)
	if val == nil {
		return uuid.Nil
	}
	if id, ok := val.(uuid.UUID); ok {
		return id
	}
	if s, ok := val.(string); ok {
		if id, err := uuid.Parse(s); err == nil {
			return id
		}
	}
	return uuid.Nil
}
