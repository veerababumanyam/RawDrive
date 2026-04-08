package workspace

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AuthLookup implements auth.WorkspaceLookup by querying the database
// for a user's primary workspace membership.
type AuthLookup struct {
	pool *pgxpool.Pool
}

// NewAuthLookup creates a new AuthLookup.
func NewAuthLookup(pool *pgxpool.Pool) *AuthLookup {
	return &AuthLookup{pool: pool}
}

// GetUserWorkspace returns the user's primary workspace ID, state ID,
// workspace role (Owner/Admin/Editor/Viewer), and platform role
// (super_admin/admin/dealer/photographer/team_member/client).
// Returns ("","","","",nil) if user has no workspace yet.
func (l *AuthLookup) GetUserWorkspace(ctx context.Context, userID string) (string, string, string, string, error) {
	var wsID, stateID, role, platformRole string

	// Primary path: user is a member of a workspace
	// Single query joins workspace_members → workspaces → roles → users
	err := l.pool.QueryRow(ctx,
		`SELECT w.id::text, COALESCE(w.state_id::text, ''), COALESCE(r.name, 'Owner'), COALESCE(u.platform_role, 'photographer')
		 FROM workspace_members wm
		 JOIN workspaces w ON w.id = wm.workspace_id
		 JOIN roles r ON r.id = wm.role_id
		 JOIN users u ON u.id = wm.user_id
		 WHERE wm.user_id = $1
		 ORDER BY wm.joined_at ASC
		 LIMIT 1`, userID,
	).Scan(&wsID, &stateID, &role, &platformRole)

	if err == nil {
		return wsID, stateID, role, platformRole, nil
	}
	if err != pgx.ErrNoRows {
		return "", "", "", "", fmt.Errorf("workspace lookup members: %w", err)
	}

	// Fallback: user owns a workspace but has no membership row
	err = l.pool.QueryRow(ctx,
		`SELECT w.id::text, COALESCE(w.state_id::text, ''), COALESCE(u.platform_role, 'photographer')
		 FROM workspaces w
		 JOIN users u ON u.id = w.owner_id
		 WHERE w.owner_id = $1
		 ORDER BY w.created_at ASC
		 LIMIT 1`, userID,
	).Scan(&wsID, &stateID, &platformRole)

	if err == nil {
		return wsID, stateID, "Owner", platformRole, nil
	}
	if err == pgx.ErrNoRows {
		// No workspace — query users table directly for platform role
		_ = l.pool.QueryRow(ctx,
			`SELECT COALESCE(platform_role, 'photographer') FROM users WHERE id = $1`, userID,
		).Scan(&platformRole)
		return "", "", "", platformRole, nil
	}
	return "", "", "", "", fmt.Errorf("workspace lookup owner: %w", err)
}
