package middleware

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PgDBContext implements DBContext by setting PostgreSQL session variables for RLS.
type PgDBContext struct {
	pool *pgxpool.Pool
}

// NewPgDBContext creates a new PgDBContext.
func NewPgDBContext(pool *pgxpool.Pool) *PgDBContext {
	return &PgDBContext{pool: pool}
}

// SetWorkspaceID sets the app.workspace_id session variable for RLS enforcement.
func (d *PgDBContext) SetWorkspaceID(ctx context.Context, workspaceID string) error {
	_, err := d.pool.Exec(ctx,
		fmt.Sprintf("SELECT set_config('app.workspace_id', '%s', false)", workspaceID),
	)
	if err != nil {
		return fmt.Errorf("set workspace context: %w", err)
	}
	return nil
}
