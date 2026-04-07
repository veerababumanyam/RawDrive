package middleware

import (
	"context"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PgAuditLog implements AuditLog by writing to the audit_log table.
type PgAuditLog struct {
	pool *pgxpool.Pool
}

// NewPgAuditLog creates a new PgAuditLog.
func NewPgAuditLog(pool *pgxpool.Pool) *PgAuditLog {
	return &PgAuditLog{pool: pool}
}

// LogAccess records an access event in the audit_log table.
func (a *PgAuditLog) LogAccess(ctx context.Context, workspaceID, action string) {
	_, err := a.pool.Exec(ctx,
		`INSERT INTO audit_log (workspace_id, action, created_at)
		 VALUES ($1, $2, now())`,
		workspaceID, action,
	)
	if err != nil {
		// Don't fail the request if audit logging fails — log and continue
		log.Printf("audit log write failed: %v", err)
	}
}
