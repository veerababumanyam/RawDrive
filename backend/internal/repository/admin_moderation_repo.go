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

type AdminModerationItem struct {
	ID            uuid.UUID  `db:"id"`
	ContentType   string     `db:"content_type"`
	ContentID     uuid.UUID  `db:"content_id"`
	ReporterID    *uuid.UUID `db:"reporter_id"`
	Reason        string     `db:"reason"`
	Description   *string    `db:"description"`
	Status        string     `db:"status"`
	ReviewerID    *uuid.UUID `db:"reviewer_id"`
	ReviewNote    *string    `db:"review_note"`
	ReviewedAt    *time.Time `db:"reviewed_at"`
	TargetUserID  *uuid.UUID `db:"target_user_id"`
	CreatedAt     time.Time  `db:"created_at"`
	UpdatedAt     time.Time  `db:"updated_at"`
}

type ModerationStats struct {
	PendingCount     int64   `db:"pending_count"`
	OverdueCount     int64   `db:"overdue_count"`
	ReviewedToday    int64   `db:"reviewed_today"`
	AverageSLAMinutes float64 `db:"average_sla_minutes"`
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
	err := r.pool.QueryRow(ctx,
		fmt.Sprintf("SELECT COUNT(*) FROM content_reports m %s", countWhere), countArgs...).Scan(&totalCount)
	if err != nil {
		return nil, fmt.Errorf("moderation count: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT
			m.id, m.content_type, m.content_id, m.reporter_id, m.reason,
			m.description, m.status, m.reviewer_id, m.review_note, m.reviewed_at,
			m.target_user_id, m.created_at, m.updated_at
		FROM content_reports m
		%s
		ORDER BY m.created_at ASC, m.id ASC
		LIMIT $%d`, whereClause, idx)

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
	rows, err := r.pool.Query(ctx, `
		SELECT id, content_type, content_id, reporter_id, reason, description,
			   status, reviewer_id, review_note, reviewed_at, target_user_id,
			   created_at, updated_at
		FROM content_reports
		WHERE id = $1`, id)
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

func (r *AdminModerationRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string, reason string, actorID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE content_reports
		SET status = $1, review_note = $2, reviewer_id = $3, reviewed_at = NOW(), updated_at = NOW()
		WHERE id = $4`, status, reason, actorID, id)
	if err != nil {
		return fmt.Errorf("moderation update: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	// Audit log
	_, err = r.pool.Exec(ctx, `
		INSERT INTO audit_logs (id, actor_id, actor_type, action, resource_type, resource_id, metadata, severity, created_at)
		VALUES ($1, $2, 'admin', 'moderation.review', 'content_report', $3, jsonb_build_object('status', $4, 'reason', $5), 'medium', NOW())`,
		uuid.New(), actorID, id, status, reason)
	return err
}

func (r *AdminModerationRepo) CountByStatus(ctx context.Context) (*ModerationStats, error) {
	var stats ModerationStats

	err := r.pool.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
			COUNT(*) FILTER (WHERE status = 'pending' AND created_at < NOW() - INTERVAL '24 hours') AS overdue_count,
			COUNT(*) FILTER (WHERE status IN ('approved', 'rejected') AND reviewed_at::date = CURRENT_DATE) AS reviewed_today,
			COALESCE(
				AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 60)
				FILTER (WHERE reviewed_at IS NOT NULL AND reviewed_at > created_at),
				0
			) AS average_sla_minutes
		FROM content_reports`).Scan(
		&stats.PendingCount, &stats.OverdueCount, &stats.ReviewedToday, &stats.AverageSLAMinutes)
	if err != nil {
		return nil, fmt.Errorf("moderation stats: %w", err)
	}
	return &stats, nil
}

func (r *AdminModerationRepo) GetUserModerationHistory(ctx context.Context, userID uuid.UUID) ([]AdminModerationItem, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, content_type, content_id, reporter_id, reason, description,
			   status, reviewer_id, review_note, reviewed_at, target_user_id,
			   created_at, updated_at
		FROM content_reports
		WHERE target_user_id = $1 OR reporter_id = $1
		ORDER BY created_at DESC
		LIMIT 100`, userID)
	if err != nil {
		return nil, fmt.Errorf("moderation history: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[AdminModerationItem])
}