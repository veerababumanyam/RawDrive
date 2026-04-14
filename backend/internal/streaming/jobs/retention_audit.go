package jobs

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// BatchAudit is one purge batch's outcome. Emitted on every Tick of every
// retention job (even when Count == 0) so ops can prove the job ran.
//
// Mapped to table streaming_retention_audit (migration 091).
type BatchAudit struct {
	Job        string    // "chat" | "viewer_sessions" | "replays"
	StartedAt  time.Time // when the tick began
	FinishedAt time.Time // when the tick ended
	Cutoff     time.Time // hard-delete cutoff used for this tick
	Count      int       // rows actually deleted (0 when DryRun)
	Failures   int       // operations that errored (CF delete failures, etc.)
	DryRun     bool
}

// AuditWriter persists a BatchAudit row.
type AuditWriter interface {
	WriteBatch(ctx context.Context, b BatchAudit) error
}

// ---- SQL-backed implementation ---------------------------------------------

// dbAuditWriter inserts rows into streaming_retention_audit.
type dbAuditWriter struct{ db *sql.DB }

// NewDBAuditWriter returns an AuditWriter backed by the given *sql.DB.
// Writes one row per Tick to streaming_retention_audit.
func NewDBAuditWriter(db *sql.DB) AuditWriter {
	return &dbAuditWriter{db: db}
}

func (w *dbAuditWriter) WriteBatch(ctx context.Context, b BatchAudit) error {
	// details stores timing + failure context without PII.
	details, _ := json.Marshal(map[string]any{
		"started_at":  b.StartedAt.UTC().Format(time.RFC3339Nano),
		"finished_at": b.FinishedAt.UTC().Format(time.RFC3339Nano),
		"failures":    b.Failures,
	})
	_, err := w.db.ExecContext(ctx, `
		INSERT INTO streaming_retention_audit
			(job_name, ran_at, cutoff_date, row_count, dry_run, details)
		VALUES ($1, now(), $2, $3, $4, $5::jsonb)
	`, b.Job, b.Cutoff, b.Count, b.DryRun, string(details))
	return err
}
