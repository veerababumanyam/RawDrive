package jobs

import (
	"context"
	"database/sql"
	"log/slog"
	"time"
)

// ChatRetentionWindow is the hard-delete cutoff for chat messages —
// 90 days after the parent stream's ended_at (F-014 DPDP policy).
const ChatRetentionWindow = 90 * 24 * time.Hour

// ChatRetentionRepo hard-deletes chat_messages rows whose parent stream
// ended before `cutoff`. The implementation MUST be transactional and
// idempotent: re-running with the same cutoff after a successful purge
// returns 0.
type ChatRetentionRepo interface {
	PurgeChatBefore(ctx context.Context, cutoff time.Time, batch int, dryRun bool) (int, error)
}

// ChatRetentionJob hard-deletes chat messages older than ChatRetentionWindow.
// One Tick per scheduled fire; the scheduler owns cadence.
type ChatRetentionJob struct {
	repo   ChatRetentionRepo
	audit  AuditWriter
	logger *slog.Logger

	clock  func() time.Time
	window time.Duration
	batch  int
	DryRun bool
}

// NewChatRetentionJob returns a ChatRetentionJob with defaults (90d window,
// batch 500, real clock).
func NewChatRetentionJob(repo ChatRetentionRepo, audit AuditWriter, logger *slog.Logger) *ChatRetentionJob {
	if logger == nil {
		logger = slog.Default()
	}
	return &ChatRetentionJob{
		repo:   repo,
		audit:  audit,
		logger: logger,
		clock:  time.Now,
		window: ChatRetentionWindow,
		batch:  500,
	}
}

// Run performs a single Tick. JobFunc-compatible for scheduler.Register.
func (j *ChatRetentionJob) Run(ctx context.Context) error {
	started := j.clock()
	cutoff := started.Add(-j.window)
	count, err := j.repo.PurgeChatBefore(ctx, cutoff, j.batch, j.DryRun)
	failures := 0
	if err != nil {
		failures = 1
		j.logger.Error("chat_retention: purge failed",
			"alert", "chat_retention_failed",
			"cutoff", cutoff,
			"err", err.Error(),
		)
	}
	// Audit every tick — even on failure — so "job ran" is observable.
	if aerr := j.audit.WriteBatch(ctx, BatchAudit{
		Job:        "chat",
		StartedAt:  started,
		FinishedAt: j.clock(),
		Cutoff:     cutoff,
		Count:      count,
		Failures:   failures,
		DryRun:     j.DryRun,
	}); aerr != nil {
		j.logger.Error("chat_retention: audit write failed",
			"alert", "retention_audit_write_failed",
			"err", aerr.Error(),
		)
	}
	return err
}

// ---- default SQL-backed repo ------------------------------------------------

type sqlChatRetentionRepo struct{ db *sql.DB }

// NewSQLChatRetentionRepo returns a ChatRetentionRepo backed by *sql.DB.
// Deletes chat_messages whose parent stream ended before `cutoff`.
func NewSQLChatRetentionRepo(db *sql.DB) ChatRetentionRepo {
	return &sqlChatRetentionRepo{db: db}
}

func (r *sqlChatRetentionRepo) PurgeChatBefore(ctx context.Context, cutoff time.Time, batch int, dryRun bool) (int, error) {
	if dryRun {
		var n int
		err := r.db.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM chat_messages cm
			JOIN streams s ON s.id = cm.stream_id
			WHERE s.ended_at IS NOT NULL AND s.ended_at < $1
		`, cutoff).Scan(&n)
		return n, err // dry-run returns would-be-deleted count so audit reflects it
	}
	res, err := r.db.ExecContext(ctx, `
		DELETE FROM chat_messages
		WHERE id IN (
			SELECT cm.id FROM chat_messages cm
			JOIN streams s ON s.id = cm.stream_id
			WHERE s.ended_at IS NOT NULL AND s.ended_at < $1
			LIMIT $2
		)
	`, cutoff, batch)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}
