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

type AdminWorkspaceRow struct {
	ID              uuid.UUID  `db:"id"`
	Name            string     `db:"name"`
	Slug            string     `db:"slug"`
	OwnerID         uuid.UUID  `db:"owner_id"`
	OwnerName       string     `db:"owner_name"`
	Status          string     `db:"status"`
	StateID         *uuid.UUID `db:"state_id"`
	StateName       *string    `db:"state_name"`
	TierSlug        *string    `db:"tier_slug"`
	StorageUsed     int64      `db:"storage_used"`
	StorageLimit    int64      `db:"storage_limit"`
	MemberCount     int64      `db:"member_count"`
	GalleryCount    int64      `db:"gallery_count"`
	CreatedAt       time.Time  `db:"created_at"`
}

type AdminWorkspaceDetail struct {
	ID              uuid.UUID  `db:"id"`
	Name            string     `db:"name"`
	Slug            string     `db:"slug"`
	OwnerID         uuid.UUID  `db:"owner_id"`
	OwnerName       string     `db:"owner_name"`
	Status          string     `db:"status"`
	StateID         *uuid.UUID `db:"state_id"`
	StateName       *string    `db:"state_name"`
	TierSlug        *string    `db:"tier_slug"`
	StorageUsed     int64      `db:"storage_used"`
	StorageLimit    int64      `db:"storage_limit"`
	MemberCount     int64      `db:"member_count"`
	GalleryCount    int64      `db:"gallery_count"`
	AssetCount      int64      `db:"asset_count"`
	CreatedAt       time.Time  `db:"created_at"`
	UpdatedAt       time.Time  `db:"updated_at"`
	Members         []WorkspaceMemberRow
}

type WorkspaceMemberRow struct {
	UserID    uuid.UUID `db:"user_id"`
	FullName  string    `db:"full_name"`
	Email     string    `db:"email"`
	Role      string    `db:"role"`
	JoinedAt  time.Time `db:"joined_at"`
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
	if f.PlanTier != "" {
		where = append(where, fmt.Sprintf("s.tier_slug = $%d", idx))
		args = append(args, f.PlanTier)
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
	case "storage_used":
		sortCol = "COALESCE(w.storage_used, 0)"
	case "member_count":
		sortCol = "mc.member_count"
	}

	// Count
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

	var totalCount int64
	err := r.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT COUNT(*)
		FROM workspaces w
		LEFT JOIN subscriptions s ON s.workspace_id = w.id AND s.status = 'active'
		%s`, countWhere), countArgs...).Scan(&totalCount)
	if err != nil {
		return nil, fmt.Errorf("admin workspace count: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT
			w.id, w.name, w.slug, w.owner_id,
			COALESCE(u.full_name, '') AS owner_name,
			w.status, w.state_id,
			st.name AS state_name,
			s.tier_slug,
			COALESCE(w.storage_used, 0) AS storage_used,
			COALESCE(w.storage_limit, 0) AS storage_limit,
			COALESCE(mc.member_count, 0) AS member_count,
			COALESCE(gc.gallery_count, 0) AS gallery_count,
			w.created_at
		FROM workspaces w
		LEFT JOIN users u ON u.id = w.owner_id
		LEFT JOIN states st ON st.id = w.state_id
		LEFT JOIN subscriptions s ON s.workspace_id = w.id AND s.status = 'active'
		LEFT JOIN LATERAL (
			SELECT COUNT(*) AS member_count FROM workspace_members WHERE workspace_id = w.id
		) mc ON true
		LEFT JOIN LATERAL (
			SELECT COUNT(*) AS gallery_count FROM galleries WHERE workspace_id = w.id
		) gc ON true
		%s
		ORDER BY %s DESC, w.id ASC
		LIMIT $%d`, whereClause, sortCol, idx)

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
	rows, err := r.pool.Query(ctx, `
		SELECT
			w.id, w.name, w.slug, w.owner_id,
			COALESCE(u.full_name, '') AS owner_name,
			w.status, w.state_id,
			st.name AS state_name,
			s.tier_slug,
			COALESCE(w.storage_used, 0) AS storage_used,
			COALESCE(w.storage_limit, 0) AS storage_limit,
			COALESCE(mc.member_count, 0) AS member_count,
			COALESCE(gc.gallery_count, 0) AS gallery_count,
			COALESCE(ac.asset_count, 0) AS asset_count,
			w.created_at, w.updated_at
		FROM workspaces w
		LEFT JOIN users u ON u.id = w.owner_id
		LEFT JOIN states st ON st.id = w.state_id
		LEFT JOIN subscriptions s ON s.workspace_id = w.id AND s.status = 'active'
		LEFT JOIN LATERAL (
			SELECT COUNT(*) AS member_count FROM workspace_members WHERE workspace_id = w.id
		) mc ON true
		LEFT JOIN LATERAL (
			SELECT COUNT(*) AS gallery_count FROM galleries WHERE workspace_id = w.id
		) gc ON true
		LEFT JOIN LATERAL (
			SELECT COUNT(*) AS asset_count FROM assets a JOIN galleries g ON g.id = a.gallery_id WHERE g.workspace_id = w.id
		) ac ON true
		WHERE w.id = $1`, id)
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

	// Fetch members
	mRows, err := r.pool.Query(ctx, `
		SELECT wm.user_id, u.full_name, u.email, wm.role, wm.created_at AS joined_at
		FROM workspace_members wm
		JOIN users u ON u.id = wm.user_id
		WHERE wm.workspace_id = $1
		ORDER BY wm.created_at ASC`, id)
	if err != nil {
		return nil, fmt.Errorf("admin workspace members: %w", err)
	}
	detail.Members, err = pgx.CollectRows(mRows, pgx.RowToStructByName[WorkspaceMemberRow])
	if err != nil {
		return nil, fmt.Errorf("admin workspace members scan: %w", err)
	}

	return &detail, nil
}