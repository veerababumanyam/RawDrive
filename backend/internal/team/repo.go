package team

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PgInvitationRepo implements InvitationRepo using PostgreSQL.
type PgInvitationRepo struct {
	pool *pgxpool.Pool
}

func NewPgInvitationRepo(pool *pgxpool.Pool) *PgInvitationRepo {
	return &PgInvitationRepo{pool: pool}
}

func (r *PgInvitationRepo) Create(ctx context.Context, inv *Invitation) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO invitations (id, email, workspace_id, role, token, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		inv.ID, inv.Email, inv.WorkspaceID, inv.Role, inv.Token, inv.ExpiresAt,
	)
	if err != nil {
		return fmt.Errorf("invitation repo create: %w", err)
	}
	return nil
}

func (r *PgInvitationRepo) GetByToken(ctx context.Context, token string) (*Invitation, error) {
	inv := &Invitation{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, workspace_id::text, role, token, expires_at, revoked
		 FROM invitations WHERE token = $1 AND revoked = false`, token,
	).Scan(&inv.ID, &inv.Email, &inv.WorkspaceID, &inv.Role, &inv.Token, &inv.ExpiresAt, &inv.Revoked)
	if err == pgx.ErrNoRows {
		return nil, ErrInvitationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("invitation repo get by token: %w", err)
	}
	return inv, nil
}

func (r *PgInvitationRepo) GetByID(ctx context.Context, id string) (*Invitation, error) {
	inv := &Invitation{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, workspace_id::text, role, token, expires_at, revoked
		 FROM invitations WHERE id = $1`, id,
	).Scan(&inv.ID, &inv.Email, &inv.WorkspaceID, &inv.Role, &inv.Token, &inv.ExpiresAt, &inv.Revoked)
	if err == pgx.ErrNoRows {
		return nil, ErrInvitationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("invitation repo get by id: %w", err)
	}
	return inv, nil
}

func (r *PgInvitationRepo) Revoke(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE invitations SET revoked = true WHERE id = $1`, id,
	)
	if err != nil {
		return fmt.Errorf("invitation repo revoke: %w", err)
	}
	return nil
}

// PgMemberRepo implements MemberRepo using PostgreSQL.
type PgMemberRepo struct {
	pool *pgxpool.Pool
}

func NewPgMemberRepo(pool *pgxpool.Pool) *PgMemberRepo {
	return &PgMemberRepo{pool: pool}
}

func (r *PgMemberRepo) AddMember(ctx context.Context, workspaceID, userID string, role Role) error {
	// Map role to role_id from the roles table
	var roleID int
	err := r.pool.QueryRow(ctx,
		`SELECT id FROM roles WHERE name = $1`, string(role),
	).Scan(&roleID)
	if err != nil {
		// Default to role_id 4 (Viewer) if role not found
		roleID = 4
	}

	_, err = r.pool.Exec(ctx,
		`INSERT INTO workspace_members (workspace_id, user_id, role_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT DO NOTHING`,
		workspaceID, userID, roleID,
	)
	if err != nil {
		return fmt.Errorf("member repo add: %w", err)
	}
	return nil
}

func (r *PgMemberRepo) RemoveMember(ctx context.Context, workspaceID, userID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
		workspaceID, userID,
	)
	if err != nil {
		return fmt.Errorf("member repo remove: %w", err)
	}
	return nil
}

func (r *PgMemberRepo) IsMember(ctx context.Context, workspaceID, userID string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2)`,
		workspaceID, userID,
	).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("member repo is member: %w", err)
	}
	return exists, nil
}
