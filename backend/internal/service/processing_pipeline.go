package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

const (
	streamName    = "ASSETS"
	subjectPrefix = "assets."
	processSubj   = "assets.process"
	durableName   = "asset-processor"
)

// ProcessingJob represents an async asset processing task.
type ProcessingJob struct {
	AssetID     uuid.UUID `json:"asset_id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`
	StorageKey  string    `json:"storage_key"`
	ContentType string    `json:"content_type"`
	Tasks       []string  `json:"tasks"` // "thumbnail", "exif", "blurhash"
}

// ProcessingPipeline orchestrates async asset processing via NATS JetStream.
type ProcessingPipeline struct {
	js           nats.JetStreamContext
	store        storage.Provider
	thumbnailSvc *ThumbnailService
	exifSvc      *ExifService
	assetRepo    *repository.AssetRepo
	logger       *slog.Logger
}

// NewProcessingPipeline creates a new ProcessingPipeline.
func NewProcessingPipeline(
	js nats.JetStreamContext,
	store storage.Provider,
	thumbnailSvc *ThumbnailService,
	exifSvc *ExifService,
	assetRepo *repository.AssetRepo,
) *ProcessingPipeline {
	return &ProcessingPipeline{
		js:           js,
		store:        store,
		thumbnailSvc: thumbnailSvc,
		exifSvc:      exifSvc,
		assetRepo:    assetRepo,
		logger:       slog.Default().With("component", "processing-pipeline"),
	}
}

// EnsureStream creates the NATS JetStream stream if it doesn't exist.
func (p *ProcessingPipeline) EnsureStream() error {
	_, err := p.js.AddStream(&nats.StreamConfig{
		Name:     streamName,
		Subjects: []string{subjectPrefix + ">"},
		MaxAge:   24 * time.Hour,
	})
	if err != nil {
		return fmt.Errorf("processing pipeline: ensure stream: %w", err)
	}
	return nil
}

// Publish enqueues a processing job.
func (p *ProcessingPipeline) Publish(ctx context.Context, job ProcessingJob) error {
	data, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("processing pipeline: marshal job: %w", err)
	}

	_, err = p.js.Publish(processSubj, data)
	if err != nil {
		return fmt.Errorf("processing pipeline: publish: %w", err)
	}

	p.logger.Info("published processing job",
		"asset_id", job.AssetID,
		"tasks", job.Tasks,
	)
	return nil
}

// Start begins consuming processing jobs. Call in a goroutine.
func (p *ProcessingPipeline) Start(ctx context.Context) error {
	sub, err := p.js.PullSubscribe(
		processSubj,
		durableName,
		nats.AckExplicit(),
		nats.MaxDeliver(3),
		nats.AckWait(60*time.Second),
	)
	if err != nil {
		return fmt.Errorf("processing pipeline: subscribe: %w", err)
	}

	p.logger.Info("processing pipeline started")

	for {
		select {
		case <-ctx.Done():
			p.logger.Info("processing pipeline shutting down")
			return nil
		default:
		}

		msgs, err := sub.Fetch(10, nats.MaxWait(5*time.Second))
		if err != nil {
			if err == nats.ErrTimeout {
				continue
			}
			p.logger.Error("fetch error", "error", err)
			continue
		}

		for _, msg := range msgs {
			if err := p.processMessage(ctx, msg); err != nil {
				p.logger.Error("processing failed",
					"error", err,
					"subject", msg.Subject,
				)
				msg.NakWithDelay(5 * time.Second)
			} else {
				msg.Ack()
			}
		}
	}
}

func (p *ProcessingPipeline) processMessage(ctx context.Context, msg *nats.Msg) error {
	var job ProcessingJob
	if err := json.Unmarshal(msg.Data, &job); err != nil {
		// Permanent failure — malformed message will never unmarshal successfully.
		// Terminate instead of Nak to avoid infinite redelivery (poison pill).
		p.logger.Error("poison pill: invalid job payload", "error", err)
		msg.Term()
		return nil // Caller should not Nak
	}

	p.logger.Info("processing asset",
		"asset_id", job.AssetID,
		"tasks", job.Tasks,
	)

	var taskErrors []string
	var derivativeResult *FullDerivativeResult

	// Check for unsupported formats that need external tools
	isUnsupportedImage := isHEICFormat(job.ContentType)
	isVideo := isVideoFormat(job.ContentType)

	for _, task := range job.Tasks {
		switch task {
		case "thumbnail":
			if isVideo {
				// Video poster frame extraction requires ffmpeg — degrade gracefully
				p.logger.Info("video detected, skipping Go-based thumbnail generation",
					"asset_id", job.AssetID, "content_type", job.ContentType)
				// Try ffmpeg if available on the system
				if err := p.tryVideoThumbnail(ctx, job); err != nil {
					p.logger.Warn("video thumbnail extraction unavailable", "asset_id", job.AssetID, "error", err)
				}
				continue
			}
			if isUnsupportedImage {
				p.logger.Warn("HEIC/HEIF format detected — Go imaging library does not support this format",
					"asset_id", job.AssetID, "content_type", job.ContentType)
				taskErrors = append(taskErrors, "thumbnail: unsupported format "+job.ContentType+" (HEIC requires ffmpeg/libvips)")
				continue
			}
			result, err := p.thumbnailSvc.GenerateForAsset(ctx, job.AssetID, job.StorageKey)
			if err != nil {
				p.logger.Error("thumbnail generation failed", "asset_id", job.AssetID, "error", err)
				taskErrors = append(taskErrors, "thumbnail: "+err.Error())
			} else {
				derivativeResult = result
			}
		case "exif":
			if err := p.exifSvc.ExtractAndStore(ctx, job.AssetID, job.StorageKey); err != nil {
				p.logger.Error("exif extraction failed", "asset_id", job.AssetID, "error", err)
				taskErrors = append(taskErrors, "exif: "+err.Error())
			}
		default:
			p.logger.Warn("unknown processing task", "task", task)
		}
	}

	// Persist derivative metadata (LQIP, blurhash, thumbnail URLs)
	if derivativeResult != nil {
		thumbnails := map[string]string{}
		for _, d := range derivativeResult.Derivatives {
			thumbnails[d.Variant] = d.StorageKey
		}
		blurhash := ""
		if derivativeResult.LQIPBase64 != "" {
			blurhash = derivativeResult.LQIPBase64 // Use LQIP as blurhash fallback
		}
		if err := p.assetRepo.UpdateThumbnails(ctx, job.AssetID, thumbnails, blurhash); err != nil {
			p.logger.Error("failed to persist thumbnails", "asset_id", job.AssetID, "error", err)
		}
	}

	if len(taskErrors) > 0 {
		// Mark asset as failed and persist the error reason
		errMsg := fmt.Sprintf("%d/%d tasks failed: %s", len(taskErrors), len(job.Tasks), taskErrors[0])
		if err := p.assetRepo.UpdateProcessingError(ctx, job.AssetID, errMsg); err != nil {
			p.logger.Error("failed to persist processing error", "asset_id", job.AssetID, "error", err)
		}
		if err := p.assetRepo.UpdateStatus(ctx, job.AssetID, "failed"); err != nil {
			return fmt.Errorf("update asset status to failed: %w", err)
		}
		p.logger.Warn("asset processing failed", "asset_id", job.AssetID, "errors", taskErrors)
		return nil // Don't return error — we handled it by marking failed
	}

	// All tasks succeeded — mark asset as ready
	if err := p.assetRepo.UpdateStatus(ctx, job.AssetID, "ready"); err != nil {
		return fmt.Errorf("update asset status: %w", err)
	}

	return nil
}

// isHEICFormat returns true if the content type indicates HEIC/HEIF format.
func isHEICFormat(ct string) bool {
	return ct == "image/heic" || ct == "image/heif" || ct == "image/heic-sequence"
}

// isVideoFormat returns true if the content type is a video format.
func isVideoFormat(ct string) bool {
	return len(ct) > 6 && ct[:6] == "video/"
}

// tryVideoThumbnail attempts to extract a poster frame from a video using ffmpeg.
func (p *ProcessingPipeline) tryVideoThumbnail(ctx context.Context, job ProcessingJob) error {
	_, err := exec.LookPath("ffmpeg")
	if err != nil {
		return fmt.Errorf("ffmpeg not found in PATH — video thumbnails require ffmpeg")
	}

	reader, err := p.store.Get(ctx, job.StorageKey)
	if err != nil {
		return fmt.Errorf("get video: %w", err)
	}
	defer reader.Close()

	tmpFile, err := os.CreateTemp("", "rawdrive-video-*.mp4")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())
	defer tmpFile.Close()

	if _, err := io.Copy(tmpFile, reader); err != nil {
		return fmt.Errorf("write temp file: %w", err)
	}
	tmpFile.Close()

	outPath := tmpFile.Name() + ".jpg"
	defer os.Remove(outPath)

	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-i", tmpFile.Name(), "-ss", "1", "-frames:v", "1", "-q:v", "2", outPath,
	)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ffmpeg extract: %w", err)
	}

	posterData, err := os.ReadFile(outPath)
	if err != nil {
		return fmt.Errorf("read poster: %w", err)
	}

	key := fmt.Sprintf("derivatives/%s/poster.jpg", job.AssetID)
	if err := p.store.Put(ctx, key, bytes.NewReader(posterData), int64(len(posterData)), "image/jpeg"); err != nil {
		return fmt.Errorf("store poster: %w", err)
	}

	thumbnails := map[string]string{"poster": key}
	if err := p.assetRepo.UpdateThumbnails(ctx, job.AssetID, thumbnails, ""); err != nil {
		return fmt.Errorf("persist poster: %w", err)
	}

	p.logger.Info("extracted video poster frame", "asset_id", job.AssetID, "key", key)
	return nil
}
