package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModerationFilter struct {
	ContentType string
	Reason      string
	Status      string
	Cursor      *uuid.UUID
	Limit       int
}

// AdminModerationItem is the wire shape returned by GET /api/v1/admin/moderation.
// JSON tags match the frontend ModerationItem TypeScript interface in
// frontend/src/lib/api/admin.ts.
//
// The backing table is moderation_items (migration 030) — NOT content_reports,
// which was never created by any migration. Earlier versions of this repo
// queried content_reports and every moderation admin call failed at runtime
// with "relation does not exist".
//
// Field mapping (struct field → moderation_items column):
//
//	ContentID   → resource_id   (aliased in SELECT)
//	ReviewedBy  → actioned_by   (aliased in SELECT)
//	ReviewedAt  → actioned_at   (aliased in SELECT)
//	Notes       → action_reason (aliased in SELECT)
type AdminModerationItem struct {
	ID          uuid.UUID  `db:"id" json:"id"`
	ContentType string     `db:"content_type" json:"content_type"`
	ContentID   uuid.UUID  `db:"content_id" json:"content_id"`
	ResourceURL *string    `db:"resource_url" json:"resource_url,omitempty"`
	Reason      string     `db:"reason" json:"reason"`
	Source      string     `db:"source" json:"source"`
	ReporterID  *uuid.UUID `db:"reporter_id" json:"reporter_id,omitempty"`
	Confidence  *float64   `db:"confidence" json:"confidence,omitempty"`
	Status      string     `db:"status" json:"status"`
	ReviewedBy  *uuid.UUID `db:"reviewed_by" json:"reviewed_by,omitempty"`
	ReviewedAt  *time.Time `db:"reviewed_at" json:"reviewed_at,omitempty"`
	Notes       *string    `db:"notes" json:"notes,omitempty"`
	SLADeadline time.Time  `db:"sla_deadline" json:"sla_deadline"`
	WorkspaceID uuid.UUID  `db:"workspace_id" json:"workspace_id"`
	CreatedAt   time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt   time.Time  `db:"updated_at" json:"updated_at"`
}

type ModerationStats struct {
	PendingCount      int64   `db:"pending_count" json:"pending_count"`
	OverdueCount      int64   `db:"overdue_count" json:"overdue_count"`
	ReviewedToday     int64   `db:"reviewed_today" json:"reviewed_today"`
	AverageSLAMinutes float64 `db:"average_sla_minutes" json:"average_sla_minutes"`
}

// ---------------------------------------------------------------------------
// Repo
// ---------------------------------------------------------------------------

type AdminModerationRepo struct {
	pool *pgxpool.Pool
}

func NewAdminModerationRepo(pool *pgxpool.Pool) *AdminModerationRepo {
	return &AdminModerationRepo{pool: pool}
}

// moderationSelectColumns is the shared SELECT list. Column aliases keep
// the struct fields aligned with the frontend wire format so pgx's
// StructByName collector can bind directly.
const moderationSelectColumns = `
		m.id,
		m.content_type,
		m.resource_id AS content_id,
		m.resource_url,
		m.reason,
		m.source,
		m.reporter_id,
		m.confidence,
		m.status,
		m.actioned_by AS reviewed_by,
		m.actioned_at AS reviewed_at,
		m.action_reason AS notes,
		m.sla_deadline,
		m.workspace_id,
		m.created_at,
		m.updated_at`

func (r *AdminModerationRepo) ListQueue(ctx context.Context, f ModerationFilter) (*PaginatedResult[AdminModerationItem], error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 50
	}

	var (
		where []string
		args  []interface{}
		idx   = 1
	)

	if f.ContentType != "" {
		where = append(where, fmt.Sprintf("m.content_type = $%d", idx))
		args = append(args, f.ContentType)
		idx++
	}
	if f.Reason != "" {
		where = append(where, fmt.Sprintf("m.reason = $%d", idx))
		args = append(args, f.Reason)
		idx++
	}
	if f.Status != "" {
		where = append(where, fmt.Sprintf("m.status = $%d", idx))
		args = append(args, f.Status)
		idx++
	}
	if f.Cursor != nil {
		where = append(where, fmt.Sprintf("m.id > $%d", idx))
		args = append(args, *f.Cursor)
		idx++
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	// Total count (without cursor).
	countArgs := args
	countWhere := whereClause
	if f.Cursor != nil && len(where) > 0 {
		countParts := where[:len(where)-1]
		if len(countParts) > 0 {
			countWhere = "WHERE " + strings.Join(countParts, " AND ")
		} else {
			countWhere = ""
		}
		countArgs = args[:len(args)-1]
	}

	var totalCount int64
	if err := r.pool.QueryRow(ctx,
		fmt.Sprintf("SELECT COUNT(*) FROM moderation_items m %s", countWhere),
		countArgs...).Scan(&totalCount); err != nil {
		return nil, fmt.Errorf("moderation count: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT%s
		FROM moderation_items m
		%s
		ORDER BY m.created_at ASC, m.id ASC
		LIMIT $%d`, moderationSelectColumns, whereClause, idx)

	args = append(args, f.Limit+1)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("moderation list: %w", err)
	}
	defer rows.Close()

	items, err := pgx.CollectRows(rows, pgx.RowToStructByName[AdminModerationItem])
	if err != nil {
		return nil, fmt.Errorf("moderation scan: %w", err)
	}

	var nextCursor *uuid.UUID
	if len(items) > f.Limit {
		items = items[:f.Limit]
		last := items[len(items)-1].ID
		nextCursor = &last
	}

	return &PaginatedResult[AdminModerationItem]{
		Items:      items,
		NextCursor: nextCursor,
		TotalCount: totalCount,
	}, nil
}

func (r *AdminModerationRepo) GetByID(ctx context.Context, id uuid.UUID) (*AdminModerationItem, error) {
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT%s
		FROM moderation_items m
		WHERE m.id = $1`, moderationSelectColumns), id)
	if err != nil {
		return nil, fmt.Errorf("moderation get: %w", err)
	}
	item, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[AdminModerationItem])
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("moderation scan: %w", err)
	}
	return &item, nil
}

// UpdateStatus transitions a moderation item to approved / rejected /
// escalated, writing the reviewer and the action_reason column (which
// stores the reason for reject and the notes for escalate). Emits a
// matching audit_logs row so the action is traceable.
func (r *AdminModerationRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string, reason string, actorID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE moderation_items
		SET status = $1,
		    action_reason = $2,
		    actioned_by = $3,
		    actioned_at = NOW(),
		    updated_at = NOW()
		WHERE id = $4`, status, reason, actorID, id)
	if err != nil {
		return fmt.Errorf("moderation update: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	// Audit log. Severity 'warning' matches the schema enum defined in
	// migration 034 (audit_logs.severity IN 'info','warning','critical').
	_, err = r.pool.Exec(ctx, `
		INSERT INTO audit_logs (id, actor_id, actor_type, action, resource_type, resource_id, metadata, severity, created_at)
		VALUES ($1, $2, 'admin', 'moderation.review', 'moderation_item', $3, jsonb_build_object('status', $4, 'reason', $5), 'warning', NOW())`,
		uuid.New(), actorID, id, status, reason)
	return err
}

func (r *AdminModerationRepo) CountByStatus(ctx context.Context) (*ModerationStats, error) {
	var stats ModerationStats

	err := r.pool.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
			COUNT(*) FILTER (WHERE status = 'pending' AND sla_deadline < NOW()) AS overdue_count,
			COUNT(*) FILTER (WHERE status IN ('approved', 'rejected') AND actioned_at::date = CURRENT_DATE) AS reviewed_today,
			COALESCE(
				AVG(EXTRACT(EPOCH FROM (actioned_at - created_at)) / 60)
				FILTER (WHERE actioned_at IS NOT NULL AND actioned_at > created_at),
				0
			) AS average_sla_minutes
		FROM moderation_items`).Scan(
		&stats.PendingCount, &stats.OverdueCount, &stats.ReviewedToday, &stats.AverageSLAMinutes)
	if err != nil {
		return nil, fmt.Errorf("moderation stats: %w", err)
	}
	return &stats, nil
}

func (r *AdminModerationRepo) GetUserModerationHistory(ctx context.Context, userID uuid.UUID) ([]AdminModerationItem, error) {
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT%s
		FROM moderation_items m
		WHERE m.reporter_id = $1 OR m.actioned_by = $1
		ORDER BY m.created_at DESC
		LIMIT 100`, moderationSelectColumns), userID)
	if err != nil {
		return nil, fmt.Errorf("moderation user history: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[AdminModerationItem])
}
