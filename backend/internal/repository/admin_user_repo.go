package repository

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AdminUserFilter struct {
	Cursor   *uuid.UUID
	Limit    int
	Search   string
	Role     string
	Status   string
	StateID  *uuid.UUID
	Sort     string // "created_at", "last_login_at", "full_name"
	TierSlug string
}

// AdminUserRow is the wire shape returned by GET /api/v1/admin/users.
// JSON tags match the frontend AdminUser interface in
// frontend/src/lib/api/admin.ts exactly; Go field names remain PascalCase
// by convention but the JSON output is snake_case for the UI.
//
// full_name is aliased from users.display_name (the actual column name
// in migration 002). platform_role comes from the column added in
// migration 035. storage_used is computed on-the-fly from the assets
// table (uploaded_by) — there is no denormalized column. workspace_count
// is computed from workspace_members. tier_slug / tier_name are reserved
// for a future subscriptions integration and currently always null.
type AdminUserRow struct {
	ID             uuid.UUID  `db:"id" json:"id"`
	FullName       string     `db:"full_name" json:"full_name"`
	Email          string     `db:"email" json:"email"`
	Phone          *string    `db:"phone" json:"phone,omitempty"`
	PlatformRole   string     `db:"platform_role" json:"platform_role"`
	Status         string     `db:"status" json:"status"`
	// state_id is the integer primary key from states.id — NOT a
	// UUID. Declared as *int32 (nullable) so the scan tolerates
	// users whose state has not been set during onboarding.
	StateID        *int32     `db:"state_id" json:"state_id,omitempty"`
	StateName      *string    `db:"state_name" json:"state_name,omitempty"`
	TierSlug       *string    `db:"tier_slug" json:"tier_slug,omitempty"`
	TierName       *string    `db:"tier_name" json:"tier_name,omitempty"`
	StorageUsed    int64      `db:"storage_used" json:"storage_used"`
	WorkspaceCount int64      `db:"workspace_count" json:"workspace_count"`
	LastLoginAt    *time.Time `db:"last_login_at" json:"last_login_at,omitempty"`
	CreatedAt      time.Time  `db:"created_at" json:"created_at"`
}

// AdminUserDetail is the shape returned by GET /api/v1/admin/users/{id}.
// Adds avatar_url, updated_at, workspaces and activity timeline on top of
// the row shape.
type AdminUserDetail struct {
	ID               uuid.UUID            `db:"id" json:"id"`
	FullName         string               `db:"full_name" json:"full_name"`
	Email            string               `db:"email" json:"email"`
	Phone            *string              `db:"phone" json:"phone,omitempty"`
	AvatarURL        *string              `db:"avatar_url" json:"avatar_url,omitempty"`
	PlatformRole     string               `db:"platform_role" json:"platform_role"`
	Status           string               `db:"status" json:"status"`
	// states.id is integer, not UUID — see AdminUserRow for the
	// same correction.
	StateID          *int32               `db:"state_id" json:"state_id,omitempty"`
	StateName        *string              `db:"state_name" json:"state_name,omitempty"`
	TierSlug         *string              `db:"tier_slug" json:"tier_slug,omitempty"`
	TierName         *string              `db:"tier_name" json:"tier_name,omitempty"`
	StorageUsed      int64                `db:"storage_used" json:"storage_used"`
	WorkspaceCount   int64                `db:"workspace_count" json:"workspace_count"`
	LastLoginAt      *time.Time           `db:"last_login_at" json:"last_login_at,omitempty"`
	CreatedAt        time.Time            `db:"created_at" json:"created_at"`
	UpdatedAt        time.Time            `db:"updated_at" json:"updated_at"`
	Workspaces       []AdminUserWorkspace `json:"workspaces"`
	ActivityTimeline []AuditLogEntry      `json:"recent_audit_logs"`
}

type AdminUserWorkspace struct {
	ID        uuid.UUID `db:"id" json:"id"`
	Name      string    `db:"name" json:"name"`
	Role      string    `db:"role" json:"role"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

type PaginatedResult[T any] struct {
	Items      []T        `json:"items"`
	NextCursor *uuid.UUID `json:"next_cursor,omitempty"`
	TotalCount int64      `json:"total_count"`
}

// ---------------------------------------------------------------------------
// Repo
// ---------------------------------------------------------------------------

type AdminUserRepo struct {
	pool *pgxpool.Pool
}

func NewAdminUserRepo(pool *pgxpool.Pool) *AdminUserRepo {
	return &AdminUserRepo{pool: pool}
}

// adminUserSelectColumns is the shared SELECT list used by List and GetByID
// so we only maintain the column-to-field mapping in one place. Every column
// aliases to the frontend-compatible snake_case name so pgx's StructByName
// collector binds directly onto the struct fields.
const adminUserSelectColumns = `
		u.id,
		COALESCE(u.display_name, '') AS full_name,
		u.email,
		u.phone,
		u.platform_role,
		u.status,
		u.state_id,
		st.name AS state_name,
		CAST(NULL AS text) AS tier_slug,
		CAST(NULL AS text) AS tier_name,
		COALESCE(
			(SELECT SUM(size_bytes) FROM assets WHERE uploaded_by = u.id AND deleted_at IS NULL),
			0
		) AS storage_used,
		COALESCE(
			(SELECT COUNT(*) FROM workspace_members WHERE user_id = u.id),
			0
		) AS workspace_count,
		u.last_login_at,
		u.created_at`

func (r *AdminUserRepo) List(ctx context.Context, f AdminUserFilter) (*PaginatedResult[AdminUserRow], error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 50
	}

	var (
		where []string
		args  []interface{}
		idx   = 1
	)

	if f.Search != "" {
		where = append(where, fmt.Sprintf(
			"(to_tsvector('english', COALESCE(u.display_name, '') || ' ' || COALESCE(u.email, '')) @@ plainto_tsquery('english', $%d))", idx))
		args = append(args, f.Search)
		idx++
	}
	if f.Role != "" {
		where = append(where, fmt.Sprintf("u.platform_role = $%d", idx))
		args = append(args, f.Role)
		idx++
	}
	if f.Status != "" {
		where = append(where, fmt.Sprintf("u.status = $%d", idx))
		args = append(args, f.Status)
		idx++
	}
	if f.StateID != nil {
		where = append(where, fmt.Sprintf("u.state_id = $%d", idx))
		args = append(args, *f.StateID)
		idx++
	}
	if f.Cursor != nil {
		where = append(where, fmt.Sprintf("u.id > $%d", idx))
		args = append(args, *f.Cursor)
		idx++
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	sortCol := "u.created_at"
	switch f.Sort {
	case "last_login_at":
		sortCol = "u.last_login_at"
	case "full_name":
		sortCol = "u.display_name"
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

	countSQL := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM users u
		%s`, countWhere)

	var totalCount int64
	if err := r.pool.QueryRow(ctx, countSQL, countArgs...).Scan(&totalCount); err != nil {
		return nil, fmt.Errorf("admin user count: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT%s
		FROM users u
		LEFT JOIN states st ON st.id = u.state_id
		%s
		ORDER BY %s DESC NULLS LAST, u.id ASC
		LIMIT $%d`,
		adminUserSelectColumns, whereClause, sortCol, idx)

	args = append(args, f.Limit+1)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("admin user list: %w", err)
	}
	defer rows.Close()

	items, err := pgx.CollectRows(rows, pgx.RowToStructByName[AdminUserRow])
	if err != nil {
		return nil, fmt.Errorf("admin user scan: %w", err)
	}

	var nextCursor *uuid.UUID
	if len(items) > f.Limit {
		items = items[:f.Limit]
		last := items[len(items)-1].ID
		nextCursor = &last
	}

	return &PaginatedResult[AdminUserRow]{
		Items:      items,
		NextCursor: nextCursor,
		TotalCount: totalCount,
	}, nil
}

func (r *AdminUserRepo) GetByID(ctx context.Context, id uuid.UUID) (*AdminUserDetail, error) {
	query := fmt.Sprintf(`
		SELECT%s,
			u.avatar_url,
			u.updated_at
		FROM users u
		LEFT JOIN states st ON st.id = u.state_id
		WHERE u.id = $1`, adminUserSelectColumns)

	rows, err := r.pool.Query(ctx, query, id)
	if err != nil {
		return nil, fmt.Errorf("admin user get: %w", err)
	}
	detail, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[AdminUserDetail])
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("admin user scan: %w", err)
	}

	// Fetch workspaces the user is a member of. The workspace_members
	// table stores role via role_id (FK to roles); we resolve the name
	// via JOIN. joined_at is the real column name (see migration 005).
	wsRows, err := r.pool.Query(ctx, `
		SELECT w.id, w.name, r.name AS role, wm.joined_at AS created_at
		FROM workspace_members wm
		JOIN workspaces w ON w.id = wm.workspace_id
		JOIN roles r ON r.id = wm.role_id
		WHERE wm.user_id = $1
		ORDER BY wm.joined_at DESC`, id)
	if err != nil {
		return nil, fmt.Errorf("admin user workspaces: %w", err)
	}
	detail.Workspaces, err = pgx.CollectRows(wsRows, pgx.RowToStructByName[AdminUserWorkspace])
	if err != nil {
		return nil, fmt.Errorf("admin user workspaces scan: %w", err)
	}

	// Fetch recent activity.
	detail.ActivityTimeline, err = r.GetActivityTimeline(ctx, id, 20)
	if err != nil {
		return nil, fmt.Errorf("admin user timeline: %w", err)
	}

	return &detail, nil
}

func (r *AdminUserRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string, reason string, actorID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2`, status, id)
	if err != nil {
		return fmt.Errorf("admin user update status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	_, err = r.pool.Exec(ctx, `
		INSERT INTO audit_logs (id, actor_id, actor_type, action, resource_type, resource_id, metadata, severity, created_at)
		VALUES ($1, $2, 'admin', 'user.status_change', 'user', $3, jsonb_build_object('status', $4, 'reason', $5), 'warning', NOW())`,
		uuid.New(), actorID, id, status, reason)
	return err
}

func (r *AdminUserRepo) UpdateRole(ctx context.Context, id uuid.UUID, role string, actorID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `UPDATE users SET platform_role = $1, updated_at = NOW() WHERE id = $2`, role, id)
	if err != nil {
		return fmt.Errorf("admin user update role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	_, err = r.pool.Exec(ctx, `
		INSERT INTO audit_logs (id, actor_id, actor_type, action, resource_type, resource_id, metadata, severity, created_at)
		VALUES ($1, $2, 'admin', 'user.role_change', 'user', $3, jsonb_build_object('role', $4), 'critical', NOW())`,
		uuid.New(), actorID, id, role)
	return err
}

func (r *AdminUserRepo) BulkUpdateStatus(ctx context.Context, ids []uuid.UUID, status string, reason string, actorID uuid.UUID) (int64, error) {
	tag, err := r.pool.Exec(ctx,
		`UPDATE users SET status = $1, updated_at = NOW() WHERE id = ANY($2)`,
		status, ids)
	if err != nil {
		return 0, fmt.Errorf("admin bulk update status: %w", err)
	}

	// Audit each affected user.
	for _, uid := range ids {
		_, _ = r.pool.Exec(ctx, `
			INSERT INTO audit_logs (id, actor_id, actor_type, action, resource_type, resource_id, metadata, severity, created_at)
			VALUES ($1, $2, 'admin', 'user.bulk_status_change', 'user', $3, jsonb_build_object('status', $4, 'reason', $5), 'critical', NOW())`,
			uuid.New(), actorID, uid, status, reason)
	}

	return tag.RowsAffected(), nil
}

func (r *AdminUserRepo) GetActivityTimeline(ctx context.Context, userID uuid.UUID, limit int) ([]AuditLogEntry, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, actor_id, actor_type, action, resource_type, resource_id,
			   metadata, before_state, after_state, ip_address, user_agent,
			   workspace_id, state_id, severity, created_at
		FROM audit_logs
		WHERE actor_id = $1 OR resource_id = $1::text
		ORDER BY created_at DESC
		LIMIT $2`, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("admin activity timeline: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[AuditLogEntry])
}

func (r *AdminUserRepo) ExportCSV(ctx context.Context, f AdminUserFilter, writer io.Writer) error {
	// Reuse list logic but with no limit for export.
	f.Limit = 0
	f.Cursor = nil

	var (
		where []string
		args  []interface{}
		idx   = 1
	)

	if f.Search != "" {
		where = append(where, fmt.Sprintf(
			"(to_tsvector('english', COALESCE(u.display_name, '') || ' ' || COALESCE(u.email, '')) @@ plainto_tsquery('english', $%d))", idx))
		args = append(args, f.Search)
		idx++
	}
	if f.Role != "" {
		where = append(where, fmt.Sprintf("u.platform_role = $%d", idx))
		args = append(args, f.Role)
		idx++
	}
	if f.Status != "" {
		where = append(where, fmt.Sprintf("u.status = $%d", idx))
		args = append(args, f.Status)
		idx++
	}
	if f.StateID != nil {
		where = append(where, fmt.Sprintf("u.state_id = $%d", idx))
		args = append(args, *f.StateID)
		idx++
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	query := fmt.Sprintf(`
		SELECT
			u.id,
			COALESCE(u.display_name, '') AS full_name,
			u.email,
			COALESCE(u.phone, '') AS phone,
			u.platform_role,
			u.status,
			COALESCE(st.name, '') AS state_name,
			COALESCE(
				(SELECT SUM(size_bytes) FROM assets WHERE uploaded_by = u.id AND deleted_at IS NULL),
				0
			) AS storage_used,
			u.created_at
		FROM users u
		LEFT JOIN states st ON st.id = u.state_id
		%s
		ORDER BY u.created_at DESC`, whereClause)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("admin export csv: %w", err)
	}
	defer rows.Close()

	w := csv.NewWriter(writer)
	defer w.Flush()

	_ = w.Write([]string{"id", "full_name", "email", "phone", "platform_role", "status", "state_name", "storage_used", "created_at"})

	for rows.Next() {
		var (
			id, fullName, email, phone, role, status, stateName string
			storageUsed                                          int64
			createdAt                                            time.Time
		)
		if err := rows.Scan(&id, &fullName, &email, &phone, &role, &status, &stateName, &storageUsed, &createdAt); err != nil {
			return fmt.Errorf("admin export row scan: %w", err)
		}
		_ = w.Write([]string{id, fullName, email, phone, role, status, stateName, fmt.Sprintf("%d", storageUsed), createdAt.Format(time.RFC3339)})
	}

	return rows.Err()
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
