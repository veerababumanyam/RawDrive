package repository

import (
	"context"
	"encoding/json"
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

// AuditLogEntry is the wire shape returned by GET /api/v1/admin/audit-logs.
// JSON tags match the frontend AuditLogEntry TypeScript interface in
// frontend/src/lib/api/admin.ts. Note the CreatedAt → inserted_at JSON
// alias: the database column is created_at (migration 034) but the
// frontend and original admin spec used inserted_at, so we project that
// name at the wire layer to keep both sides stable.
type AuditLogEntry struct {
	ID           uuid.UUID       `db:"id" json:"id"`
	ActorID      uuid.UUID       `db:"actor_id" json:"actor_id"`
	ActorType    string          `db:"actor_type" json:"actor_type"`
	Action       string          `db:"action" json:"action"`
	ResourceType string          `db:"resource_type" json:"resource_type"`
	ResourceID   string          `db:"resource_id" json:"resource_id,omitempty"`
	Metadata     json.RawMessage `db:"metadata" json:"metadata,omitempty"`
	BeforeState  json.RawMessage `db:"before_state" json:"before,omitempty"`
	AfterState   json.RawMessage `db:"after_state" json:"after,omitempty"`
	IPAddress    *string         `db:"ip_address" json:"ip_address,omitempty"`
	UserAgent    *string         `db:"user_agent" json:"user_agent,omitempty"`
	WorkspaceID  *uuid.UUID      `db:"workspace_id" json:"workspace_id,omitempty"`
	StateID      *uuid.UUID      `db:"state_id" json:"state_id,omitempty"`
	Severity     string          `db:"severity" json:"severity"`
	CreatedAt    time.Time       `db:"created_at" json:"inserted_at"`
}

type AuditLogFilter struct {
	ActorID      *uuid.UUID
	Action       string
	ResourceType string
	ResourceID   string
	DateFrom     *time.Time
	DateTo       *time.Time
	Severity     string
	IPAddress    string
	Cursor       *uuid.UUID
	Limit        int
}

type AuditLogCreate struct {
	ActorID      uuid.UUID       `json:"actor_id"`
	ActorType    string          `json:"actor_type"`
	Action       string          `json:"action"`
	ResourceType string          `json:"resource_type"`
	ResourceID   string          `json:"resource_id"`
	Metadata     json.RawMessage `json:"metadata,omitempty"`
	BeforeState  json.RawMessage `json:"before_state,omitempty"`
	AfterState   json.RawMessage `json:"after_state,omitempty"`
	IPAddress    *string         `json:"ip_address,omitempty"`
	UserAgent    *string         `json:"user_agent,omitempty"`
	WorkspaceID  *uuid.UUID      `json:"workspace_id,omitempty"`
	StateID      *uuid.UUID      `json:"state_id,omitempty"`
	Severity     string          `json:"severity"`
}

// ---------------------------------------------------------------------------
// Repo
// ---------------------------------------------------------------------------

type AuditLogRepo struct {
	pool *pgxpool.Pool
}

func NewAuditLogRepo(pool *pgxpool.Pool) *AuditLogRepo {
	return &AuditLogRepo{pool: pool}
}

func (r *AuditLogRepo) Create(ctx context.Context, e AuditLogCreate) (*AuditLogEntry, error) {
	id := uuid.New()
	now := time.Now().UTC()

	metadata := e.Metadata
	if metadata == nil {
		metadata = json.RawMessage(`{}`)
	}

	row := r.pool.QueryRow(ctx, `
		INSERT INTO audit_logs
			(id, actor_id, actor_type, action, resource_type, resource_id,
			 metadata, before_state, after_state, ip_address, user_agent,
			 workspace_id, state_id, severity, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		RETURNING id, actor_id, actor_type, action, resource_type, resource_id,
			metadata, before_state, after_state, ip_address, user_agent,
			workspace_id, state_id, severity, created_at`,
		id, e.ActorID, e.ActorType, e.Action, e.ResourceType, e.ResourceID,
		metadata, e.BeforeState, e.AfterState, e.IPAddress, e.UserAgent,
		e.WorkspaceID, e.StateID, e.Severity, now)

	var entry AuditLogEntry
	err := row.Scan(
		&entry.ID, &entry.ActorID, &entry.ActorType, &entry.Action,
		&entry.ResourceType, &entry.ResourceID, &entry.Metadata,
		&entry.BeforeState, &entry.AfterState, &entry.IPAddress, &entry.UserAgent,
		&entry.WorkspaceID, &entry.StateID, &entry.Severity, &entry.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("audit log create: %w", err)
	}
	return &entry, nil
}

func (r *AuditLogRepo) BulkCreate(ctx context.Context, entries []AuditLogCreate) (int64, error) {
	if len(entries) == 0 {
		return 0, nil
	}

	batch := &pgx.Batch{}
	for _, e := range entries {
		metadata := e.Metadata
		if metadata == nil {
			metadata = json.RawMessage(`{}`)
		}
		batch.Queue(`
			INSERT INTO audit_logs
				(id, actor_id, actor_type, action, resource_type, resource_id,
				 metadata, before_state, after_state, ip_address, user_agent,
				 workspace_id, state_id, severity, created_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
			uuid.New(), e.ActorID, e.ActorType, e.Action, e.ResourceType, e.ResourceID,
			metadata, e.BeforeState, e.AfterState, e.IPAddress, e.UserAgent,
			e.WorkspaceID, e.StateID, e.Severity, time.Now().UTC())
	}

	br := r.pool.SendBatch(ctx, batch)
	defer br.Close()

	var count int64
	for range entries {
		tag, err := br.Exec()
		if err != nil {
			return count, fmt.Errorf("audit log bulk insert: %w", err)
		}
		count += tag.RowsAffected()
	}
	return count, nil
}

func (r *AuditLogRepo) List(ctx context.Context, f AuditLogFilter) (*PaginatedResult[AuditLogEntry], error) {
	if f.Limit <= 0 || f.Limit > 1000 {
		f.Limit = 500
	}

	var (
		where []string
		args  []interface{}
		idx   = 1
	)

	if f.ActorID != nil {
		where = append(where, fmt.Sprintf("a.actor_id = $%d", idx))
		args = append(args, *f.ActorID)
		idx++
	}
	if f.Action != "" {
		where = append(where, fmt.Sprintf("a.action = $%d", idx))
		args = append(args, f.Action)
		idx++
	}
	if f.ResourceType != "" {
		where = append(where, fmt.Sprintf("a.resource_type = $%d", idx))
		args = append(args, f.ResourceType)
		idx++
	}
	if f.ResourceID != "" {
		where = append(where, fmt.Sprintf("a.resource_id = $%d", idx))
		args = append(args, f.ResourceID)
		idx++
	}
	if f.DateFrom != nil {
		where = append(where, fmt.Sprintf("a.created_at >= $%d", idx))
		args = append(args, *f.DateFrom)
		idx++
	}
	if f.DateTo != nil {
		where = append(where, fmt.Sprintf("a.created_at <= $%d", idx))
		args = append(args, *f.DateTo)
		idx++
	}
	if f.Severity != "" {
		where = append(where, fmt.Sprintf("a.severity = $%d", idx))
		args = append(args, f.Severity)
		idx++
	}
	if f.IPAddress != "" {
		where = append(where, fmt.Sprintf("a.ip_address ILIKE $%d || '%%'", idx))
		args = append(args, f.IPAddress)
		idx++
	}

	// Save pre-cursor state for count.
	countParts := make([]string, len(where))
	copy(countParts, where)
	countArgs := make([]interface{}, len(args))
	copy(countArgs, args)

	if f.Cursor != nil {
		where = append(where, fmt.Sprintf("a.id < $%d", idx))
		args = append(args, *f.Cursor)
		idx++
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}
	countWhere := ""
	if len(countParts) > 0 {
		countWhere = "WHERE " + strings.Join(countParts, " AND ")
	}

	var totalCount int64
	err := r.pool.QueryRow(ctx,
		fmt.Sprintf("SELECT COUNT(*) FROM audit_logs a %s", countWhere), countArgs...).Scan(&totalCount)
	if err != nil {
		return nil, fmt.Errorf("audit log count: %w", err)
	}

	// resource_type / resource_id / before_state / after_state are
	// nullable columns (migration 034) but the AuditLogEntry struct
	// declares them as non-pointer. COALESCE them to safe zero values
	// so pgx's StructByName scan succeeds on rows with NULLs.
	query := fmt.Sprintf(`
		SELECT
			a.id, a.actor_id, a.actor_type, a.action,
			COALESCE(a.resource_type, '') AS resource_type,
			COALESCE(a.resource_id, '')   AS resource_id,
			COALESCE(a.metadata, '{}'::jsonb)     AS metadata,
			COALESCE(a.before_state, '{}'::jsonb) AS before_state,
			COALESCE(a.after_state, '{}'::jsonb)  AS after_state,
			a.ip_address, a.user_agent,
			a.workspace_id, a.state_id, a.severity, a.created_at
		FROM audit_logs a
		%s
		ORDER BY a.created_at DESC, a.id DESC
		LIMIT $%d`, whereClause, idx)

	args = append(args, f.Limit+1)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("audit log list: %w", err)
	}
	defer rows.Close()

	items, err := pgx.CollectRows(rows, pgx.RowToStructByName[AuditLogEntry])
	if err != nil {
		return nil, fmt.Errorf("audit log scan: %w", err)
	}

	var nextCursor *uuid.UUID
	if len(items) > f.Limit {
		items = items[:f.Limit]
		last := items[len(items)-1].ID
		nextCursor = &last
	}

	return &PaginatedResult[AuditLogEntry]{
		Items:      items,
		NextCursor: nextCursor,
		TotalCount: totalCount,
	}, nil
}

func (r *AuditLogRepo) GetByID(ctx context.Context, id uuid.UUID) (*AuditLogEntry, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, actor_id, actor_type, action,
			   COALESCE(resource_type, '') AS resource_type,
			   COALESCE(resource_id, '')   AS resource_id,
			   COALESCE(metadata, '{}'::jsonb)     AS metadata,
			   COALESCE(before_state, '{}'::jsonb) AS before_state,
			   COALESCE(after_state, '{}'::jsonb)  AS after_state,
			   ip_address, user_agent,
			   workspace_id, state_id, severity, created_at
		FROM audit_logs
		WHERE id = $1`, id)
	if err != nil {
		return nil, fmt.Errorf("audit log get: %w", err)
	}
	entry, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[AuditLogEntry])
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("audit log scan: %w", err)
	}
	return &entry, nil
}

func (r *AuditLogRepo) Count(ctx context.Context, f AuditLogFilter) (int64, error) {
	var (
		where []string
		args  []interface{}
		idx   = 1
	)

	if f.ActorID != nil {
		where = append(where, fmt.Sprintf("actor_id = $%d", idx))
		args = append(args, *f.ActorID)
		idx++
	}
	if f.Action != "" {
		where = append(where, fmt.Sprintf("action = $%d", idx))
		args = append(args, f.Action)
		idx++
	}
	if f.ResourceType != "" {
		where = append(where, fmt.Sprintf("resource_type = $%d", idx))
		args = append(args, f.ResourceType)
		idx++
	}
	if f.DateFrom != nil {
		where = append(where, fmt.Sprintf("created_at >= $%d", idx))
		args = append(args, *f.DateFrom)
		idx++
	}
	if f.DateTo != nil {
		where = append(where, fmt.Sprintf("created_at <= $%d", idx))
		args = append(args, *f.DateTo)
		idx++
	}
	if f.Severity != "" {
		where = append(where, fmt.Sprintf("severity = $%d", idx))
		args = append(args, f.Severity)
		idx++
	}
	if f.IPAddress != "" {
		where = append(where, fmt.Sprintf("ip_address ILIKE $%d || '%%'", idx))
		args = append(args, f.IPAddress)
		idx++
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	var count int64
	err := r.pool.QueryRow(ctx,
		fmt.Sprintf("SELECT COUNT(*) FROM audit_logs %s", whereClause), args...).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("audit log count: %w", err)
	}
	return count, nil
}