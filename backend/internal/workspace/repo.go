package workspace

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PgRepo implements Repository using PostgreSQL.
type PgRepo struct {
	pool *pgxpool.Pool
}

// NewPgRepo creates a new PostgreSQL-backed workspace repository.
func NewPgRepo(pool *pgxpool.Pool) *PgRepo {
	return &PgRepo{pool: pool}
}

func (r *PgRepo) Create(ctx context.Context, ws *Workspace) (*Workspace, error) {
	err := r.pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, plan_tier)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id`,
		ws.Name, ws.StateID, ws.OwnerID, ws.PlanTier,
	).Scan(&ws.ID)
	if err != nil {
		// Issue #5: surface migration-096 unique violations as a
		// typed sentinel so the onboarding adapter can short-circuit
		// the partial-failure retry case without leaking PG codes.
		if isDuplicateOwnerName(err) {
			return nil, ErrDuplicateName
		}
		return nil, fmt.Errorf("workspace repo create: %w", err)
	}
	return ws, nil
}

// GetByOwnerAndName fetches the workspace owned by ownerID whose name
// matches case-insensitively. Returns ErrNotFound when no row matches.
// Used by the onboarding adapter to recover from a duplicate-insert
// retry by returning the previously-created workspace ID.
func (r *PgRepo) GetByOwnerAndName(ctx context.Context, ownerID, name string) (*Workspace, error) {
	ws := &Workspace{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, COALESCE(state_id::text,''), COALESCE(owner_id::text,''), COALESCE(plan_tier, 'free')
		 FROM workspaces WHERE owner_id = $1 AND lower(name) = lower($2) LIMIT 1`,
		ownerID, name,
	).Scan(&ws.ID, &ws.Name, &ws.StateID, &ws.OwnerID, &ws.PlanTier)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("workspace repo get by owner+name: %w", err)
	}
	return ws, nil
}

// isDuplicateOwnerName reports whether err originates from a
// unique_violation on the migration-096 (owner_id, lower(name)) index.
// Matching by constraint name keeps unrelated future unique indexes
// (e.g., a global slug) from being misclassified as duplicate-name.
func isDuplicateOwnerName(err error) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return false
	}
	if pgErr.Code != "23505" {
		return false
	}
	return pgErr.ConstraintName == "workspaces_owner_lower_name_uniq"
}

func (r *PgRepo) GetByID(ctx context.Context, id string) (*Workspace, error) {
	ws := &Workspace{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, COALESCE(state_id::text,''), COALESCE(owner_id::text,''), COALESCE(plan_tier, 'free')
		 FROM workspaces WHERE id = $1`, id,
	).Scan(&ws.ID, &ws.Name, &ws.StateID, &ws.OwnerID, &ws.PlanTier)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("workspace repo get: %w", err)
	}
	return ws, nil
}

// GetByOwner returns the first workspace owned by the given user.
func (r *PgRepo) GetByOwner(ctx context.Context, ownerID string) (*Workspace, error) {
	ws := &Workspace{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, COALESCE(state_id::text,''), COALESCE(owner_id::text,''), COALESCE(plan_tier, 'free')
		 FROM workspaces WHERE owner_id = $1 LIMIT 1`, ownerID,
	).Scan(&ws.ID, &ws.Name, &ws.StateID, &ws.OwnerID, &ws.PlanTier)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("workspace repo get by owner: %w", err)
	}
	return ws, nil
}
