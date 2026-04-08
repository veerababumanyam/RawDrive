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
	Sort     string // "created_at", "last_active_at", "full_name"
	TierSlug string
}

type AdminUserRow struct {
	ID            uuid.UUID  `db:"id"`
	FullName      string     `db:"full_name"`
	Email         string     `db:"email"`
	Phone         *string    `db:"phone"`
	Role          string     `db:"role"`
	Status        string     `db:"status"`
	StateID       *uuid.UUID `db:"state_id"`
	StateName     *string    `db:"state_name"`
	TierSlug      *string    `db:"tier_slug"`
	StorageUsed   int64      `db:"storage_used"`
	GalleryCount  int64      `db:"gallery_count"`
	AssetCount    int64      `db:"asset_count"`
	LastActiveAt  *time.Time `db:"last_active_at"`
	CreatedAt     time.Time  `db:"created_at"`
}

type AdminUserDetail struct {
	ID              uuid.UUID        `db:"id"`
	FullName        string           `db:"full_name"`
	Email           string           `db:"email"`
	Phone           *string          `db:"phone"`
	AvatarURL       *string          `db:"avatar_url"`
	Role            string           `db:"role"`
	Status          string           `db:"status"`
	StateID         *uuid.UUID       `db:"state_id"`
	StateName       *string          `db:"state_name"`
	TierSlug        *string          `db:"tier_slug"`
	StorageUsed     int64            `db:"storage_used"`
	StorageLimit    int64            `db:"storage_limit"`
	GalleryCount    int64            `db:"gallery_count"`
	AssetCount      int64            `db:"asset_count"`
	LastActiveAt    *time.Time       `db:"last_active_at"`
	CreatedAt       time.Time        `db:"created_at"`
	UpdatedAt       time.Time        `db:"updated_at"`
	Workspaces      []AdminUserWorkspace
	ActivityTimeline []AuditLogEntry
}

type AdminUserWorkspace struct {
	ID        uuid.UUID `db:"id"`
	Name      string    `db:"name"`
	Role      string    `db:"role"`
	CreatedAt time.Time `db:"created_at"`
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
			"(to_tsvector('english', u.full_name || ' ' || u.email) @@ plainto_tsquery('english', $%d))", idx))
		args = append(args, f.Search)
		idx++
	}
	if f.Role != "" {
		where = append(where, fmt.Sprintf("u.role = $%d", idx))
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
	if f.TierSlug != "" {
		where = append(where, fmt.Sprintf("s.tier_slug = $%d", idx))
		args = append(args, f.TierSlug)
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
	case "last_active_at":
		sortCol = "u.last_active_at"
	case "full_name":
		sortCol = "u.full_name"
	}

	// Count query (without cursor/limit).
	countWhere := whereClause
	if f.Cursor != nil && len(where) > 0 {
		// Remove the cursor condition for total count.
		countParts := where[:len(where)-1]
		if len(countParts) > 0 {
			countWhere = "WHERE " + strings.Join(countParts, " AND ")
		} else {
			countWhere = ""
		}
	}

	countSQL := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM users u
		LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'
		%s`, countWhere)

	var totalCount int64
	err := r.pool.QueryRow(ctx, countSQL, args[:len(args)-boolToInt(f.Cursor != nil)]...).Scan(&totalCount)
	if err != nil {
		return nil, fmt.Errorf("admin user count: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT
			u.id, u.full_name, u.email, u.phone, u.role, u.status,
			u.state_id, st.name AS state_name,
			s.tier_slug,
			COALESCE(u.storage_used, 0) AS storage_used,
			COALESCE(gc.gallery_count, 0) AS gallery_count,
			COALESCE(ac.asset_count, 0) AS asset_count,
			u.last_active_at, u.created_at
		FROM users u
		LEFT JOIN states st ON st.id = u.state_id
		LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'
		LEFT JOIN LATERAL (
			SELECT COUNT(*) AS gallery_count FROM galleries WHERE user_id = u.id
		) gc ON true
		LEFT JOIN LATERAL (
			SELECT COUNT(*) AS asset_count FROM assets WHERE user_id = u.id
		) ac ON true
		%s
		ORDER BY %s DESC, u.id ASC
		LIMIT $%d`,
		whereClause, sortCol, idx)

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
	query := `
		SELECT
			u.id, u.full_name, u.email, u.phone, u.avatar_url, u.role, u.status,
			u.state_id, st.name AS state_name,
			s.tier_slug,
			COALESCE(u.storage_used, 0) AS storage_used,
			COALESCE(u.storage_limit, 0) AS storage_limit,
			COALESCE(gc.gallery_count, 0) AS gallery_count,
			COALESCE(ac.asset_count, 0) AS asset_count,
			u.last_active_at, u.created_at, u.updated_at
		FROM users u
		LEFT JOIN states st ON st.id = u.state_id
		LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'
		LEFT JOIN LATERAL (
			SELECT COUNT(*) AS gallery_count FROM galleries WHERE user_id = u.id
		) gc ON true
		LEFT JOIN LATERAL (
			SELECT COUNT(*) AS asset_count FROM assets WHERE user_id = u.id
		) ac ON true
		WHERE u.id = $1`

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

	// Fetch workspaces
	wsRows, err := r.pool.Query(ctx, `
		SELECT w.id, w.name, wm.role, wm.created_at
		FROM workspace_members wm
		JOIN workspaces w ON w.id = wm.workspace_id
		WHERE wm.user_id = $1
		ORDER BY wm.created_at DESC`, id)
	if err != nil {
		return nil, fmt.Errorf("admin user workspaces: %w", err)
	}
	detail.Workspaces, err = pgx.CollectRows(wsRows, pgx.RowToStructByName[AdminUserWorkspace])
	if err != nil {
		return nil, fmt.Errorf("admin user workspaces scan: %w", err)
	}

	// Fetch recent activity
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
		VALUES ($1, $2, 'admin', 'user.status_change', 'user', $3, jsonb_build_object('status', $4, 'reason', $5), 'medium', NOW())`,
		uuid.New(), actorID, id, status, reason)
	return err
}

func (r *AdminUserRepo) UpdateRole(ctx context.Context, id uuid.UUID, role string, actorID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`, role, id)
	if err != nil {
		return fmt.Errorf("admin user update role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	_, err = r.pool.Exec(ctx, `
		INSERT INTO audit_logs (id, actor_id, actor_type, action, resource_type, resource_id, metadata, severity, created_at)
		VALUES ($1, $2, 'admin', 'user.role_change', 'user', $3, jsonb_build_object('role', $4), 'high', NOW())`,
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
			VALUES ($1, $2, 'admin', 'user.bulk_status_change', 'user', $3, jsonb_build_object('status', $4, 'reason', $5), 'high', NOW())`,
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
			"(to_tsvector('english', u.full_name || ' ' || u.email) @@ plainto_tsquery('english', $%d))", idx))
		args = append(args, f.Search)
		idx++
	}
	if f.Role != "" {
		where = append(where, fmt.Sprintf("u.role = $%d", idx))
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
			u.id, u.full_name, u.email, COALESCE(u.phone, '') AS phone,
			u.role, u.status,
			COALESCE(st.name, '') AS state_name,
			COALESCE(s.tier_slug, '') AS tier_slug,
			COALESCE(u.storage_used, 0) AS storage_used,
			u.created_at
		FROM users u
		LEFT JOIN states st ON st.id = u.state_id
		LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'
		%s
		ORDER BY u.created_at DESC`, whereClause)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("admin export csv: %w", err)
	}
	defer rows.Close()

	w := csv.NewWriter(writer)
	defer w.Flush()

	_ = w.Write([]string{"id", "full_name", "email", "phone", "role", "status", "state_name", "tier_slug", "storage_used", "created_at"})

	for rows.Next() {
		var (
			id, fullName, email, phone, role, status, stateName, tierSlug string
			storageUsed                                                   int64
			createdAt                                                     time.Time
		)
		if err := rows.Scan(&id, &fullName, &email, &phone, &role, &status, &stateName, &tierSlug, &storageUsed, &createdAt); err != nil {
			return fmt.Errorf("admin export row scan: %w", err)
		}
		_ = w.Write([]string{id, fullName, email, phone, role, status, stateName, tierSlug, fmt.Sprintf("%d", storageUsed), createdAt.Format(time.RFC3339)})
	}

	return rows.Err()
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}