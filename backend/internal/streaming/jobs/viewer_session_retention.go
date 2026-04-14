package jobs

import (
	"context"
	"database/sql"
	"log/slog"
	"time"
)

// ViewerSessionRetentionWindow is the hard-delete cutoff for viewer_sessions
// — 30 days after expires_at (F-014 DPDP policy).
const ViewerSessionRetentionWindow = 30 * 24 * time.Hour

// ViewerSessionRetentionRepo hard-deletes viewer_sessions rows whose
// expires_at is before `cutoff`. Idempotent: re-running returns 0.
type ViewerSessionRetentionRepo interface {
	PurgeSessionsExpiredBefore(ctx context.Context, cutoff time.Time, batch int, dryRun bool) (int, error)
}

// ViewerSessionRetentionJob hard-deletes viewer_sessions older than
// ViewerSessionRetentionWindow past their expires_at.
type ViewerSessionRetentionJob struct {
	repo   ViewerSessionRetentionRepo
	audit  AuditWriter
	logger *slog.Logger

	clock  func() time.Time
	window time.Duration
	batch  int
	DryRun bool
}

// NewViewerSessionRetentionJob returns a job with defaults (30d window,
// batch 1000, real clock).
func NewViewerSessionRetentionJob(repo ViewerSessionRetentionRepo, audit AuditWriter, logger *slog.Logger) *ViewerSessionRetentionJob {
	if logger == nil {
		logger = slog.Default()
	}
	return &ViewerSessionRetentionJob{
		repo:   repo,
		audit:  audit,
		logger: logger,
		clock:  time.Now,
		window: ViewerSessionRetentionWindow,
		batch:  1000,
	}
}

// Run performs a single Tick. JobFunc-compatible.
func (j *ViewerSessionRetentionJob) Run(ctx context.Context) error {
	started := j.clock()
	cutoff := started.Add(-j.window)
	count, err := j.repo.PurgeSessionsExpiredBefore(ctx, cutoff, j.batch, j.DryRun)
	failures := 0
	if err != nil {
		failures = 1
		j.logger.Error("viewer_session_retention: purge failed",
			"alert", "viewer_session_retention_failed",
			"cutoff", cutoff,
			"err", err.Error(),
		)
	}
	if aerr := j.audit.WriteBatch(ctx, BatchAudit{
		Job:        "viewer_sessions",
		StartedAt:  started,
		FinishedAt: j.clock(),
		Cutoff:     cutoff,
		Count:      count,
		Failures:   failures,
		DryRun:     j.DryRun,
	}); aerr != nil {
		j.logger.Error("viewer_session_retention: audit write failed",
			"alert", "retention_audit_write_failed",
			"err", aerr.Error(),
		)
	}
	return err
}

// ---- default SQL-backed repo ------------------------------------------------

type sqlViewerSessionRetentionRepo struct{ db *sql.DB }

// NewSQLViewerSessionRetentionRepo returns a repo backed by *sql.DB.
func NewSQLViewerSessionRetentionRepo(db *sql.DB) ViewerSessionRetentionRepo {
	return &sqlViewerSessionRetentionRepo{db: db}
}

func (r *sqlViewerSessionRetentionRepo) PurgeSessionsExpiredBefore(ctx context.Context, cutoff time.Time, batch int, dryRun bool) (int, error) {
	if dryRun {
		var n int
		err := r.db.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM viewer_sessions
			WHERE expires_at IS NOT NULL AND expires_at < $1
		`, cutoff).Scan(&n)
		return n, err // dry-run returns would-be-deleted count for audit observability
	}
	res, err := r.db.ExecContext(ctx, `
		DELETE FROM viewer_sessions
		WHERE id IN (
			SELECT id FROM viewer_sessions
			WHERE expires_at IS NOT NULL AND expires_at < $1
			LIMIT $2
		)
	`, cutoff, batch)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}
