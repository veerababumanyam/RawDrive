package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// IngestRevealReason enumerates the allowed values per migration 087's
// ingest_reveal_audit_reason_check. Denied-reveal attempts are logged at
// the application layer (structured logger), not this append-only table.
type IngestRevealReason string

const (
	RevealReasonScheduledT30   IngestRevealReason = "scheduled_t_minus_30"
	RevealReasonManualOverride IngestRevealReason = "manual_override"
	RevealReasonAPI            IngestRevealReason = "api"
	RevealReasonRotation       IngestRevealReason = "rotation"
)

// IsValid reports whether the reason is one of the enum values permitted by
// the CHECK constraint on ingest_reveal_audit.
func (r IngestRevealReason) IsValid() bool {
	switch r {
	case RevealReasonScheduledT30, RevealReasonManualOverride, RevealReasonAPI, RevealReasonRotation:
		return true
	}
	return false
}

// IngestRevealAuditEntry is a row in ingest_reveal_audit.
type IngestRevealAuditEntry struct {
	ID          uuid.UUID
	WorkspaceID uuid.UUID
	StreamID    uuid.UUID
	RevealedBy  *uuid.UUID // nullable (system-initiated rotations have no user)
	Reason      IngestRevealReason
	RevealedAt  time.Time
	ClientIP    string // stored as INET; empty string skips the column
	UserAgent   string
}

// IngestAuditRepo is the persistence surface consumed by RevealService and
// RotateService. The append-only guard at the DB level (migration 087
// trigger) makes UPDATE/DELETE impossible — the interface reflects that.
type IngestAuditRepo interface {
	Insert(ctx context.Context, entry IngestRevealAuditEntry) (uuid.UUID, error)
	ListByStream(ctx context.Context, streamID uuid.UUID, limit int) ([]IngestRevealAuditEntry, error)
}

// PgIngestAuditRepo is the pgx-backed implementation. It relies on the
// current_setting('app.current_workspace_id') RLS context being set by the
// request middleware — callers MUST enter an authenticated tx.
type PgIngestAuditRepo struct {
	db *pgxpool.Pool
}

func NewPgIngestAuditRepo(db *pgxpool.Pool) *PgIngestAuditRepo {
	return &PgIngestAuditRepo{db: db}
}

func (r *PgIngestAuditRepo) Insert(ctx context.Context, e IngestRevealAuditEntry) (uuid.UUID, error) {
	if !e.Reason.IsValid() {
		return uuid.Nil, ErrInvalidRevealReason
	}
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
	if e.RevealedAt.IsZero() {
		e.RevealedAt = time.Now().UTC()
	}
	const q = `
		INSERT INTO ingest_reveal_audit
			(id, workspace_id, stream_id, revealed_by, reveal_reason,
			 revealed_at, client_ip, user_agent)
		VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, '')::inet, $8)
		RETURNING id`
	var id uuid.UUID
	err := r.db.QueryRow(ctx, q,
		e.ID, e.WorkspaceID, e.StreamID, e.RevealedBy, string(e.Reason),
		e.RevealedAt, e.ClientIP, e.UserAgent,
	).Scan(&id)
	return id, err
}

func (r *PgIngestAuditRepo) ListByStream(ctx context.Context, streamID uuid.UUID, limit int) ([]IngestRevealAuditEntry, error) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	const q = `
		SELECT id, workspace_id, stream_id, revealed_by, reveal_reason,
		       revealed_at, COALESCE(host(client_ip), ''), COALESCE(user_agent, '')
		FROM ingest_reveal_audit
		WHERE stream_id = $1
		ORDER BY revealed_at DESC
		LIMIT $2`
	rows, err := r.db.Query(ctx, q, streamID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []IngestRevealAuditEntry
	for rows.Next() {
		var e IngestRevealAuditEntry
		var reason string
		if err := rows.Scan(&e.ID, &e.WorkspaceID, &e.StreamID, &e.RevealedBy, &reason,
			&e.RevealedAt, &e.ClientIP, &e.UserAgent); err != nil {
			return nil, err
		}
		e.Reason = IngestRevealReason(reason)
		out = append(out, e)
	}
	return out, rows.Err()
}

// ErrInvalidRevealReason signals an attempted insert with a reason outside
// the permitted enum.
var ErrInvalidRevealReason = newStaticErr("ingest_audit: reveal_reason outside permitted enum")

func newStaticErr(s string) error { return &staticErr{msg: s} }

type staticErr struct{ msg string }

func (e *staticErr) Error() string { return e.msg }
