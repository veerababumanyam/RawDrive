// Package jobs holds M33 background workers — replay purge, retention
// sweeps — that run on cron cadences alongside the ReconciliationWorker.
package jobs

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/rawdrive/backend/internal/streaming/cf"
)

// RecordingDeleter deletes a CF recording by videoID. Typically the real
// CF client; 404 is treated as success (already gone).
type RecordingDeleter interface {
	DeleteRecording(ctx context.Context, videoID string) error
}

// PurgeJob sweeps expired replays every interval, calling CF to delete
// the recording and marking the stream row as replay_state='expired'.
type PurgeJob struct {
	repo     cf.ReplayRepo
	deleter  RecordingDeleter
	clock    func() time.Time
	interval time.Duration
	batch    int
	logger   *slog.Logger
}

func NewPurgeJob(repo cf.ReplayRepo, deleter RecordingDeleter, logger *slog.Logger) *PurgeJob {
	if logger == nil {
		logger = slog.Default()
	}
	return &PurgeJob{
		repo:     repo,
		deleter:  deleter,
		clock:    time.Now,
		interval: time.Hour,
		batch:    50,
		logger:   logger,
	}
}

// Run blocks until ctx is cancelled.
func (j *PurgeJob) Run(ctx context.Context) error {
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		_ = j.Tick(ctx)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(j.interval):
		}
	}
}

// Tick runs a single purge sweep.
func (j *PurgeJob) Tick(ctx context.Context) error {
	list, err := j.repo.ListExpired(ctx, j.clock(), j.batch)
	if err != nil {
		return err
	}
	for _, st := range list {
		if err := ctx.Err(); err != nil {
			return err
		}
		if st.ReplayVideoID != "" && j.deleter != nil {
			if derr := j.deleter.DeleteRecording(ctx, st.ReplayVideoID); derr != nil {
				// 404 → treat as success (already gone). Other errors leave
				// the row in 'available' for retry next tick.
				var cfErr *cf.CFError
				if !errors.As(derr, &cfErr) || cfErr.Code != 404 {
					// CF is refusing to delete — the replay is still
					// consuming customer quota and may serve past the
					// retention cliff. Error-level + alert field so ops
					// can page on sustained failures.
					j.logger.Error("purge: cf delete failed",
						"stream", st.ID,
						"video_id", st.ReplayVideoID,
						"alert", "replay_purge_blocked",
						"err", derr.Error(),
					)
					continue
				}
			}
		}
		if err := j.repo.UpdateReplayExpired(ctx, st.ID); err != nil {
			// DB write failure on the expiry marker — CF recording is
			// already gone but we lost the state transition. Ops needs
			// to know since the row will be retried every tick.
			j.logger.Warn("purge: mark expired failed",
				"stream", st.ID,
				"alert", "replay_expiry_state_lost",
				"err", err.Error(),
			)
		}
	}
	return nil
}
