package middleware

import (
	"context"
	"log"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PgAuditLog implements AuditLog by writing to the audit_logs table
// (plural, the M7 schema from migration 034_alter_m7_audit_logs). The
// legacy singular audit_log table created in migration 009 does not have
// a workspace_id column, which is why earlier writes here failed with
// SQLSTATE 42703.
type PgAuditLog struct {
	pool *pgxpool.Pool
}

// NewPgAuditLog creates a new PgAuditLog.
func NewPgAuditLog(pool *pgxpool.Pool) *PgAuditLog {
	return &PgAuditLog{pool: pool}
}

// LogAccess records a middleware-origin access event in the audit_logs
// table. actor_id is pulled from the JWT claims on the context when
// available (every authenticated request has them, since TenantContext
// runs after the auth middleware). actor_type is 'user' when we know who
// the actor is and 'system' when we don't — this keeps the enterprise
// audit trail queryable by user while still logging anonymous/system-only
// access paths.
func (a *PgAuditLog) LogAccess(ctx context.Context, workspaceID, action string) {
	var actorID *uuid.UUID
	actorType := "system"
	if claims := JWTClaimsFromContext(ctx); claims != nil {
		if sub, ok := claims["sub"].(string); ok && sub != "" {
			if id, err := uuid.Parse(sub); err == nil {
				actorID = &id
				actorType = "user"
			}
		}
	}

	_, err := a.pool.Exec(ctx,
		`INSERT INTO audit_logs (workspace_id, actor_id, actor_type, action)
		 VALUES ($1, $2, $3, $4)`,
		workspaceID, actorID, actorType, action,
	)
	if err != nil {
		// Don't fail the request if audit logging fails — log and continue
		log.Printf("audit log write failed: %v", err)
	}
}
