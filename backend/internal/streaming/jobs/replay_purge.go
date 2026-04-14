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
	// audit is optional; when non-nil every Tick writes one BatchAudit row
	// with Job="replays" for DPDP observability (M35 / 35-8).
	audit AuditWriter
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

// SetAuditWriter wires an AuditWriter so every Tick emits one row to
// streaming_retention_audit (M35 / 35-8). Safe to call once at construction.
func (j *PurgeJob) SetAuditWriter(a AuditWriter) { j.audit = a }

// Tick runs a single purge sweep.
func (j *PurgeJob) Tick(ctx context.Context) error {
	started := j.clock()
	cutoff := started
	list, err := j.repo.ListExpired(ctx, cutoff, j.batch)
	if err != nil {
		if j.audit != nil {
			_ = j.audit.WriteBatch(ctx, BatchAudit{
				Job:        "replays",
				StartedAt:  started,
				FinishedAt: j.clock(),
				Cutoff:     cutoff,
				Count:      0,
				Failures:   1,
			})
		}
		return err
	}
	purged := 0
	failures := 0
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
					failures++
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
			failures++
			continue
		}
		purged++
	}
	if j.audit != nil {
		if aerr := j.audit.WriteBatch(ctx, BatchAudit{
			Job:        "replays",
			StartedAt:  started,
			FinishedAt: j.clock(),
			Cutoff:     cutoff,
			Count:      purged,
			Failures:   failures,
		}); aerr != nil {
			j.logger.Error("purge: audit write failed",
				"alert", "retention_audit_write_failed",
				"err", aerr.Error(),
			)
		}
	}
	return nil
}
