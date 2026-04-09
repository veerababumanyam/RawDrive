package ai

import (
	"context"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rawdrive/backend/internal/storage"
)

type AestheticWorker struct {
	pool       *pgxpool.Pool
	jobRepo    *JobRepo
	configRepo *ConfigRepo
	spendRepo  *SpendRepo
	gemini     *GeminiClient
	store      storage.Provider
	pollInterval time.Duration
	stopCh       chan struct{}
}

func NewAestheticWorker(pool *pgxpool.Pool, jobRepo *JobRepo, configRepo *ConfigRepo, spendRepo *SpendRepo, gemini *GeminiClient, store storage.Provider) *AestheticWorker {
	return &AestheticWorker{pool: pool, jobRepo: jobRepo, configRepo: configRepo, spendRepo: spendRepo, gemini: gemini, store: store, pollInterval: 15 * time.Second, stopCh: make(chan struct{})}
}

func (w *AestheticWorker) Start(ctx context.Context) {
	log.Println("aesthetic worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-w.stopCh:
			return
		case <-ticker.C:
			w.processNextBatch(ctx)
		}
	}
}

func (w *AestheticWorker) Stop() { close(w.stopCh) }

func (w *AestheticWorker) processNextBatch(ctx context.Context) {
	jobs, _ := w.jobRepo.ListPending(ctx, "aesthetic_scoring", 3)
	for _, job := range jobs {
		if err := w.processJob(ctx, job); err != nil {
			log.Printf("aesthetic worker: job %s failed: %v", job.ID, err)
			w.jobRepo.MarkFailed(ctx, job.ID, err.Error())
		}
	}
}

func (w *AestheticWorker) processJob(ctx context.Context, job *AIJob) error {
	w.jobRepo.UpdateProgress(ctx, job.ID, "running", 0)
	apiKey, _, err := w.configRepo.GetDecryptedKey(ctx, job.WorkspaceID)
	if err != nil {
		return err
	}
	assetIDsRaw, ok := job.Result["asset_ids"].([]any)
	if !ok {
		return ErrParseFailure
	}
	scored := 0
	for i, rawID := range assetIDsRaw {
		idStr, ok := rawID.(string)
		if !ok {
			continue
		}
		assetID, err := uuid.Parse(idStr)
		if err != nil {
			continue
		}
		var storageKey string
		if err := w.pool.QueryRow(ctx, `SELECT storage_key FROM assets WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`, assetID, job.WorkspaceID).Scan(&storageKey); err != nil {
			continue
		}
		reader, err := w.store.Get(ctx, storageKey)
		if err != nil {
			continue
		}
		imageData, err := readAll(reader)
		if err != nil {
			continue
		}
		score, inputTok, outputTok, err := w.gemini.AssessQuality(ctx, apiKey, imageData, "image/jpeg")
		if err != nil {
			continue
		}
		cost := EstimateCost(w.gemini.modelID, int64(inputTok), int64(outputTok))
		w.spendRepo.LogUsage(ctx, &AIUsageLog{WorkspaceID: job.WorkspaceID, Operation: "aesthetic_scoring", Model: w.gemini.modelID, InputTokens: int64(inputTok), OutputTokens: int64(outputTok), CostEstimatePaisa: cost, AssetID: &assetID})
		w.pool.Exec(ctx, `INSERT INTO quality_scores (asset_id, workspace_id, sharpness, exposure, composition, overall) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (asset_id) DO UPDATE SET sharpness=$3, exposure=$4, composition=$5, overall=$6, created_at=now()`, assetID, job.WorkspaceID, score.Sharpness, score.Exposure, score.Composition, score.Overall)
		w.pool.Exec(ctx, `UPDATE assets SET ai_quality_score = $1 WHERE id = $2`, score.Overall, assetID)
		scored++
		w.jobRepo.UpdateProgress(ctx, job.ID, "running", i+1)
	}
	return w.jobRepo.MarkDone(ctx, job.ID, map[string]any{"scored": scored, "total": len(assetIDsRaw)})
}
