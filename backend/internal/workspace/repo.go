package workspace

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
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
		`INSERT INTO workspaces (name, state_id, owner_id)
		 VALUES ($1, $2, $3)
		 RETURNING id`,
		ws.Name, ws.StateID, ws.OwnerID,
	).Scan(&ws.ID)
	if err != nil {
		return nil, fmt.Errorf("workspace repo create: %w", err)
	}
	return ws, nil
}

func (r *PgRepo) GetByID(ctx context.Context, id string) (*Workspace, error) {
	ws := &Workspace{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, COALESCE(state_id::text,''), COALESCE(owner_id::text,'')
		 FROM workspaces WHERE id = $1`, id,
	).Scan(&ws.ID, &ws.Name, &ws.StateID, &ws.OwnerID)
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
		`SELECT id, name, COALESCE(state_id::text,''), COALESCE(owner_id::text,'')
		 FROM workspaces WHERE owner_id = $1 LIMIT 1`, ownerID,
	).Scan(&ws.ID, &ws.Name, &ws.StateID, &ws.OwnerID)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("workspace repo get by owner: %w", err)
	}
	return ws, nil
}
