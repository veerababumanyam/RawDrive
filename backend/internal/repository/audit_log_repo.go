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
	ActorName    string          `db:"actor_name" json:"actor_name,omitempty"`
	ActorEmail   string          `db:"actor_email" json:"actor_email,omitempty"`
	ActorAvatar  string          `db:"actor_avatar_url" json:"actor_avatar_url,omitempty"`
	ActorRole    string          `db:"actor_role" json:"actor_role,omitempty"`
	ActorStatus  string          `db:"actor_status" json:"actor_status,omitempty"`
	Action       string          `db:"action" json:"action"`
	ResourceType string          `db:"resource_type" json:"resource_type"`
	ResourceID   string          `db:"resource_id" json:"resource_id,omitempty"`
	Metadata     json.RawMessage `db:"metadata" json:"metadata,omitempty"`
	BeforeState  json.RawMessage `db:"before_state" json:"before,omitempty"`
	AfterState   json.RawMessage `db:"after_state" json:"after,omitempty"`
	IPAddress    *string         `db:"ip_address" json:"ip_address,omitempty"`
	UserAgent    *string         `db:"user_agent" json:"user_agent,omitempty"`
	WorkspaceID  *uuid.UUID      `db:"workspace_id" json:"workspace_id,omitempty"`
	StateID      *int32          `db:"state_id" json:"state_id,omitempty"`
	Severity     string          `db:"severity" json:"severity"`
	CreatedAt    time.Time       `db:"created_at" json:"inserted_at"`
	SearchText   string          `db:"search_text" json:"search_text,omitempty"`
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
	// ActorTerm — M39 E8-S1 (FR-F04): case-insensitive substring match on
	// users.display_name OR users.email via LEFT JOIN. Ignored when ActorID
	// is set (ActorID wins per precedence rule).
	ActorTerm string
	Search    string
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
	StateID      *int32          `json:"state_id,omitempty"`
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

func auditLogSearchTextSQL() string {
	return `
		CONCAT_WS(' ',
			a.action,
			COALESCE(a.actor_id::text, ''),
			a.actor_type,
			COALESCE(u.display_name, ''),
			COALESCE(u.email, ''),
			COALESCE(u.phone, ''),
			COALESCE(u.platform_role, ''),
			COALESCE(u.status, ''),
			COALESCE(a.resource_type, ''),
			COALESCE(a.resource_id, ''),
			COALESCE(a.ip_address, ''),
			COALESCE(a.user_agent, ''),
			COALESCE(a.metadata::text, ''),
			COALESCE(a.before_state::text, ''),
			COALESCE(a.after_state::text, ''),
			CASE
				WHEN a.action ILIKE '%payment%'
				  OR a.action ILIKE '%billing%'
				  OR COALESCE(a.resource_type, '') ILIKE '%payment%'
				  OR COALESCE(a.resource_type, '') ILIKE '%billing%'
				  OR COALESCE(a.metadata::text, '') ILIKE '%razorpay%'
				  OR COALESCE(a.metadata::text, '') ILIKE '%subscription%'
				THEN 'payment payments billing checkout gateway razorpay subscription order invoice'
				ELSE ''
			END,
			CASE
				WHEN a.action ILIKE '%profile%'
				  OR a.action ILIKE '%user%'
				  OR COALESCE(a.resource_type, '') ILIKE '%profile%'
				  OR COALESCE(a.resource_type, '') ILIKE '%user%'
				  OR u.id IS NOT NULL
				THEN 'user users profile actor account'
				ELSE ''
			END
		)`
}

func auditLogSelectSQL() string {
	return fmt.Sprintf(`
		SELECT
			a.id,
			COALESCE(a.actor_id, '00000000-0000-0000-0000-000000000000'::uuid) AS actor_id,
			a.actor_type,
			CASE WHEN a.actor_id IS NULL THEN 'System' ELSE COALESCE(u.display_name, '') END AS actor_name,
			COALESCE(u.email, '') AS actor_email,
			COALESCE(u.avatar_url, '') AS actor_avatar_url,
			COALESCE(u.platform_role, '') AS actor_role,
			COALESCE(u.status, '') AS actor_status,
			a.action,
			COALESCE(a.resource_type, '') AS resource_type,
			COALESCE(a.resource_id, '')   AS resource_id,
			COALESCE(a.metadata, '{}'::jsonb)     AS metadata,
			COALESCE(a.before_state, '{}'::jsonb) AS before_state,
			COALESCE(a.after_state, '{}'::jsonb)  AS after_state,
			a.ip_address, a.user_agent,
			a.workspace_id, a.state_id, a.severity, a.created_at,
			%s AS search_text
		FROM audit_logs a
		LEFT JOIN users u ON u.id = a.actor_id`, auditLogSearchTextSQL())
}

func auditLogCursorWhereSQL(idx int) string {
	return fmt.Sprintf(`(
		a.created_at < (SELECT cursor_log.created_at FROM audit_logs cursor_log WHERE cursor_log.id = $%d)
		OR (
			a.created_at = (SELECT cursor_log.created_at FROM audit_logs cursor_log WHERE cursor_log.id = $%d)
			AND a.id < $%d
		)
	)`, idx, idx, idx)
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

	// M39 E8-S1: actor_id wins over actor term; apply one or the other.
	actorTerm := strings.TrimSpace(f.ActorTerm)
	if f.ActorID != nil {
		where = append(where, fmt.Sprintf("a.actor_id = $%d", idx))
		args = append(args, *f.ActorID)
		idx++
	} else if actorTerm != "" {
		pattern := "%" + actorTerm + "%"
		where = append(where, fmt.Sprintf("(u.display_name ILIKE $%d OR u.email ILIKE $%d)", idx, idx))
		args = append(args, pattern)
		idx++
	}
	searchTerm := strings.TrimSpace(f.Search)
	if searchTerm != "" {
		pattern := "%" + searchTerm + "%"
		where = append(where, fmt.Sprintf(`(
			a.action ILIKE $%d OR
			a.actor_type ILIKE $%d OR
			COALESCE(a.resource_type, '') ILIKE $%d OR
			COALESCE(a.resource_id, '') ILIKE $%d OR
			COALESCE(a.ip_address, '') ILIKE $%d OR
			COALESCE(a.user_agent, '') ILIKE $%d OR
			COALESCE(a.metadata::text, '') ILIKE $%d OR
			COALESCE(a.before_state::text, '') ILIKE $%d OR
			COALESCE(a.after_state::text, '') ILIKE $%d OR
			COALESCE(u.display_name, '') ILIKE $%d OR
			COALESCE(u.email, '') ILIKE $%d OR
			COALESCE(u.phone, '') ILIKE $%d OR
			COALESCE(u.platform_role, '') ILIKE $%d OR
			COALESCE(u.status, '') ILIKE $%d OR
			%s ILIKE $%d
		)`, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx, auditLogSearchTextSQL(), idx))
		args = append(args, pattern)
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
		where = append(where, auditLogCursorWhereSQL(idx))
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
		fmt.Sprintf("SELECT COUNT(*) FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id %s", countWhere), countArgs...).Scan(&totalCount)
	if err != nil {
		return nil, fmt.Errorf("audit log count: %w", err)
	}

	// resource_type / resource_id / before_state / after_state are
	// nullable columns (migration 034) but the AuditLogEntry struct
	// declares them as non-pointer. COALESCE them to safe zero values
	// so pgx's StructByName scan succeeds on rows with NULLs.
	query := fmt.Sprintf(`
		%s
		%s
		ORDER BY a.created_at DESC, a.id DESC
		LIMIT $%d`, auditLogSelectSQL(), whereClause, idx)

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
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		%s
		WHERE a.id = $1`, auditLogSelectSQL()), id)
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
		where = append(where, fmt.Sprintf("a.actor_id = $%d", idx))
		args = append(args, *f.ActorID)
		idx++
	}
	searchTerm := strings.TrimSpace(f.Search)
	if searchTerm != "" {
		pattern := "%" + searchTerm + "%"
		where = append(where, fmt.Sprintf(`(
			a.action ILIKE $%d OR
			a.actor_type ILIKE $%d OR
			COALESCE(a.resource_type, '') ILIKE $%d OR
			COALESCE(a.resource_id, '') ILIKE $%d OR
			COALESCE(a.ip_address, '') ILIKE $%d OR
			COALESCE(a.user_agent, '') ILIKE $%d OR
			COALESCE(a.metadata::text, '') ILIKE $%d OR
			COALESCE(a.before_state::text, '') ILIKE $%d OR
			COALESCE(a.after_state::text, '') ILIKE $%d OR
			COALESCE(u.display_name, '') ILIKE $%d OR
			COALESCE(u.email, '') ILIKE $%d OR
			COALESCE(u.phone, '') ILIKE $%d OR
			COALESCE(u.platform_role, '') ILIKE $%d OR
			COALESCE(u.status, '') ILIKE $%d OR
			%s ILIKE $%d
		)`, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx, auditLogSearchTextSQL(), idx))
		args = append(args, pattern)
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

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	var count int64
	err := r.pool.QueryRow(ctx,
		fmt.Sprintf("SELECT COUNT(*) FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id %s", whereClause), args...).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("audit log count: %w", err)
	}
	return count, nil
}
