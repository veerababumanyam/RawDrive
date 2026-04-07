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

// GetUserWorkspace returns the user's primary workspace ID and state ID.
// Returns ("","",nil) if user has no workspace yet.
func (l *AuthLookup) GetUserWorkspace(ctx context.Context, userID string) (string, string, error) {
	var wsID, stateID string

	// Try workspace_members first (user might be a member of someone else's workspace)
	err := l.pool.QueryRow(ctx,
		`SELECT w.id::text, COALESCE(w.state_id::text, '')
		 FROM workspace_members wm
		 JOIN workspaces w ON w.id = wm.workspace_id
		 WHERE wm.user_id = $1
		 ORDER BY wm.joined_at ASC
		 LIMIT 1`, userID,
	).Scan(&wsID, &stateID)

	if err == nil {
		return wsID, stateID, nil
	}
	if err != pgx.ErrNoRows {
		return "", "", fmt.Errorf("workspace lookup members: %w", err)
	}

	// Fallback: check if user owns a workspace directly
	err = l.pool.QueryRow(ctx,
		`SELECT id::text, COALESCE(state_id::text, '')
		 FROM workspaces
		 WHERE owner_id = $1
		 ORDER BY created_at ASC
		 LIMIT 1`, userID,
	).Scan(&wsID, &stateID)

	if err == nil {
		return wsID, stateID, nil
	}
	if err == pgx.ErrNoRows {
		return "", "", nil // No workspace yet — user needs onboarding
	}
	return "", "", fmt.Errorf("workspace lookup owner: %w", err)
}
