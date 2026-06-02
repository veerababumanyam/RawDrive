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

// SetWorkspaceID sets the workspace session variables used by RLS policies.
//
// F-009 (audit 2026-04-10): this function used to interpolate workspaceID
// directly into the SQL string via fmt.Sprintf, which was a textbook SQL
// injection vector because workspaceID flows in from JWT claims — if an
// attacker ever influenced the JWT payload they could inject arbitrary SQL
// at tenant-context-set time. The fix is boring: use a parameterized query
// so pgx escapes the value at the wire protocol level. set_config()'s second
// argument accepts a placeholder, so this is a drop-in replacement.
func (d *PgDBContext) SetWorkspaceID(ctx context.Context, workspaceID string) error {
	_, err := d.pool.Exec(ctx,
		`SELECT
			set_config('app.workspace_id', $1, false),
			set_config('app.current_workspace_id', $1, false)`,
		workspaceID,
	)
	if err != nil {
		return fmt.Errorf("set workspace context: %w", err)
	}
	return nil
}
