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

type AdminWorkspaceFilter struct {
	PlanTier string
	StateID  *uuid.UUID
	Status   string
	Search   string
	Cursor   *uuid.UUID
	Limit    int
	Sort     string // "created_at", "storage_used", "member_count"
}

// AdminWorkspaceRow is the wire shape returned by GET /api/v1/admin/workspaces.
// JSON tags match the frontend WorkspaceOverview interface in
// frontend/src/lib/api/admin.ts exactly.
//
// Field sources (see admin_workspace_repo.List for the full SELECT):
// - owner_name: users.display_name (there is no users.full_name column)
// - storage_used_bytes: SUM(assets.size_bytes) where workspace_id matches
// - asset_count: COUNT(assets) where workspace_id matches
// - subscription_tier: reserved for future subscriptions integration, null today
type AdminWorkspaceRow struct {
	ID               uuid.UUID `db:"id" json:"id"`
	Name             string    `db:"name" json:"name"`
	OwnerID          uuid.UUID `db:"owner_id" json:"owner_id"`
	OwnerName        string    `db:"owner_name" json:"owner_name"`
	Status           string    `db:"status" json:"status"`
	StateID          *int      `db:"state_id" json:"state_id,omitempty"`
	StateName        *string   `db:"state_name" json:"state_name,omitempty"`
	SubscriptionTier *string   `db:"subscription_tier" json:"subscription_tier,omitempty"`
	StorageUsedBytes int64     `db:"storage_used_bytes" json:"storage_used_bytes"`
	MemberCount      int64     `db:"member_count" json:"member_count"`
	GalleryCount     int64     `db:"gallery_count" json:"gallery_count"`
	AssetCount       int64     `db:"asset_count" json:"asset_count"`
	CreatedAt        time.Time `db:"created_at" json:"created_at"`
}

type AdminWorkspaceDetail struct {
	ID               uuid.UUID            `db:"id" json:"id"`
	Name             string               `db:"name" json:"name"`
	OwnerID          uuid.UUID            `db:"owner_id" json:"owner_id"`
	OwnerName        string               `db:"owner_name" json:"owner_name"`
	Status           string               `db:"status" json:"status"`
	StateID          *int                 `db:"state_id" json:"state_id,omitempty"`
	StateName        *string              `db:"state_name" json:"state_name,omitempty"`
	SubscriptionTier *string              `db:"subscription_tier" json:"subscription_tier,omitempty"`
	StorageUsedBytes int64                `db:"storage_used_bytes" json:"storage_used_bytes"`
	MemberCount      int64                `db:"member_count" json:"member_count"`
	GalleryCount     int64                `db:"gallery_count" json:"gallery_count"`
	AssetCount       int64                `db:"asset_count" json:"asset_count"`
	CreatedAt        time.Time            `db:"created_at" json:"created_at"`
	UpdatedAt        time.Time            `db:"updated_at" json:"updated_at"`
	Members          []WorkspaceMemberRow `json:"members"`
}

// WorkspaceMemberRow shape for the members panel on the workspace detail
// page. role is resolved from workspace_members.role_id → roles.name
// (migration 005 stores the FK, not the string). joined_at is the real
// column name, not created_at.
type WorkspaceMemberRow struct {
	UserID   uuid.UUID `db:"user_id" json:"user_id"`
	FullName string    `db:"full_name" json:"full_name"`
	Email    string    `db:"email" json:"email"`
	Role     string    `db:"role" json:"role"`
	JoinedAt time.Time `db:"joined_at" json:"joined_at"`
}

// ---------------------------------------------------------------------------
// Repo
// ---------------------------------------------------------------------------

type AdminWorkspaceRepo struct {
	pool *pgxpool.Pool
}

func NewAdminWorkspaceRepo(pool *pgxpool.Pool) *AdminWorkspaceRepo {
	return &AdminWorkspaceRepo{pool: pool}
}

// adminWorkspaceSelectColumns is the shared SELECT list used by List and
// GetByID. All storage/count metrics are computed on-the-fly via LATERAL
// subqueries against the real tables — there are no denormalized
// storage_used/storage_limit columns on the workspaces table, despite
// what earlier versions of this repo assumed.
const adminWorkspaceSelectColumns = `
		w.id,
		w.name,
		w.owner_id,
		COALESCE(u.display_name, '') AS owner_name,
		w.status,
		w.state_id,
		st.name AS state_name,
		CAST(NULL AS text) AS subscription_tier,
		COALESCE(
			(SELECT SUM(size_bytes) FROM assets
			 WHERE workspace_id = w.id AND deleted_at IS NULL),
			0
		) AS storage_used_bytes,
		COALESCE(
			(SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id),
			0
		) AS member_count,
		COALESCE(
			(SELECT COUNT(*) FROM galleries WHERE workspace_id = w.id),
			0
		) AS gallery_count,
		COALESCE(
			(SELECT COUNT(*) FROM assets
			 WHERE workspace_id = w.id AND deleted_at IS NULL),
			0
		) AS asset_count,
		w.created_at`

func (r *AdminWorkspaceRepo) List(ctx context.Context, f AdminWorkspaceFilter) (*PaginatedResult[AdminWorkspaceRow], error) {
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
			"(to_tsvector('english', w.name) @@ plainto_tsquery('english', $%d))", idx))
		args = append(args, f.Search)
		idx++
	}
	if f.Status != "" {
		where = append(where, fmt.Sprintf("w.status = $%d", idx))
		args = append(args, f.Status)
		idx++
	}
	if f.StateID != nil {
		where = append(where, fmt.Sprintf("w.state_id = $%d", idx))
		args = append(args, *f.StateID)
		idx++
	}
	if f.Cursor != nil {
		where = append(where, fmt.Sprintf("w.id > $%d", idx))
		args = append(args, *f.Cursor)
		idx++
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	sortCol := "w.created_at"
	switch f.Sort {
	case "storage_used", "storage_used_bytes":
		sortCol = "storage_used_bytes"
	case "member_count":
		sortCol = "member_count"
	}

	// Count (without cursor condition).
	countWhere := whereClause
	countArgs := args
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
		FROM workspaces w
		%s`, countWhere)

	var totalCount int64
	if err := r.pool.QueryRow(ctx, countSQL, countArgs...).Scan(&totalCount); err != nil {
		return nil, fmt.Errorf("admin workspace count: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT%s
		FROM workspaces w
		LEFT JOIN users u ON u.id = w.owner_id
		LEFT JOIN states st ON st.id = w.state_id
		%s
		ORDER BY %s DESC NULLS LAST, w.id ASC
		LIMIT $%d`,
		adminWorkspaceSelectColumns, whereClause, sortCol, idx)

	args = append(args, f.Limit+1)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("admin workspace list: %w", err)
	}
	defer rows.Close()

	items, err := pgx.CollectRows(rows, pgx.RowToStructByName[AdminWorkspaceRow])
	if err != nil {
		return nil, fmt.Errorf("admin workspace scan: %w", err)
	}

	var nextCursor *uuid.UUID
	if len(items) > f.Limit {
		items = items[:f.Limit]
		last := items[len(items)-1].ID
		nextCursor = &last
	}

	return &PaginatedResult[AdminWorkspaceRow]{
		Items:      items,
		NextCursor: nextCursor,
		TotalCount: totalCount,
	}, nil
}

func (r *AdminWorkspaceRepo) GetByID(ctx context.Context, id uuid.UUID) (*AdminWorkspaceDetail, error) {
	query := fmt.Sprintf(`
		SELECT%s,
			w.updated_at
		FROM workspaces w
		LEFT JOIN users u ON u.id = w.owner_id
		LEFT JOIN states st ON st.id = w.state_id
		WHERE w.id = $1`, adminWorkspaceSelectColumns)

	rows, err := r.pool.Query(ctx, query, id)
	if err != nil {
		return nil, fmt.Errorf("admin workspace get: %w", err)
	}
	detail, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[AdminWorkspaceDetail])
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("admin workspace scan: %w", err)
	}

	// Members. The role column is resolved from workspace_members.role_id
	// via the roles table (migration 005 stores the FK, not the string).
	// joined_at is the real column name.
	mRows, err := r.pool.Query(ctx, `
		SELECT wm.user_id,
		       COALESCE(u.display_name, '') AS full_name,
		       u.email,
		       r.name AS role,
		       wm.joined_at
		FROM workspace_members wm
		JOIN users u ON u.id = wm.user_id
		JOIN roles r ON r.id = wm.role_id
		WHERE wm.workspace_id = $1
		ORDER BY wm.joined_at ASC`, id)
	if err != nil {
		return nil, fmt.Errorf("admin workspace members: %w", err)
	}
	detail.Members, err = pgx.CollectRows(mRows, pgx.RowToStructByName[WorkspaceMemberRow])
	if err != nil {
		return nil, fmt.Errorf("admin workspace members scan: %w", err)
	}

	return &detail, nil
}

// Suspend marks a workspace as suspended. Suspended workspaces cannot be
// accessed by their members but data is preserved (for billing disputes or
// abuse investigations). Reason is recorded in suspended_reason for the
// audit trail and the admin UI.
func (r *AdminWorkspaceRepo) Suspend(ctx context.Context, id uuid.UUID, reason string, actorID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE workspaces
		 SET status = 'suspended',
		     suspended_at = now(),
		     suspended_reason = $2,
		     suspended_by = $3,
		     updated_at = now()
		 WHERE id = $1 AND deleted_at IS NULL AND status != 'deleted'`,
		id, reason, actorID)
	if err != nil {
		return fmt.Errorf("admin workspace suspend: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Unsuspend clears the suspended state and returns a workspace to active.
func (r *AdminWorkspaceRepo) Unsuspend(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE workspaces
		 SET status = 'active',
		     suspended_at = NULL,
		     suspended_reason = NULL,
		     suspended_by = NULL,
		     updated_at = now()
		 WHERE id = $1 AND status = 'suspended' AND deleted_at IS NULL`,
		id)
	if err != nil {
		return fmt.Errorf("admin workspace unsuspend: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SoftDelete marks a workspace as deleted. The row stays for 30 days to
// allow restoration; a background purge worker hard-deletes thereafter.
// This matches the DPDPA/GDPR "deletion within a reasonable period"
// guidance while preserving a recovery window for accidents.
func (r *AdminWorkspaceRepo) SoftDelete(ctx context.Context, id uuid.UUID, actorID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE workspaces
		 SET status = 'deleted',
		     deleted_at = now(),
		     deleted_by = $2,
		     updated_at = now()
		 WHERE id = $1 AND deleted_at IS NULL`,
		id, actorID)
	if err != nil {
		return fmt.Errorf("admin workspace delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
